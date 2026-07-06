from fastapi import FastAPI, UploadFile, File, HTTPException, Depends, Header
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from google import genai
from google.genai import types
from supabase import create_client
from dotenv import load_dotenv
from sqlalchemy import create_engine, Column, Integer, String, DateTime, text
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from datetime import datetime
from typing import Optional
import io
import os
import json
import re
import secrets

load_dotenv()

# ── Gemini ──
client = genai.Client(api_key=os.getenv("GEMINI_API_KEY"))

# ── Supabase (for auth) ──
supabase = create_client(
    os.getenv("SUPABASE_URL"),
    os.getenv("SUPABASE_SERVICE_KEY")
)

# ── PostgreSQL (for recipes) ──
engine = create_engine(os.getenv("DATABASE_URL"))
SessionLocal = sessionmaker(bind=engine)
Base = declarative_base()

class Recipe(Base):
    __tablename__ = "recipes"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(String, nullable=False)
    title = Column(String)
    ingredients = Column(String)
    instructions = Column(String)
    notes = Column(String)
    language = Column(String, default="en")
    image_url = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    # Labels stored as a JSON array of strings e.g. '["Weeknight", "Korean"]'
    labels = Column(String, default="[]")
    # share_token is a random URL-safe string generated on demand.
    # NULL means the recipe has never been shared. Once generated, the
    # same token is reused so the share URL stays stable.
    # NOTE: add this column manually in Supabase if it doesn't exist:
    #   ALTER TABLE recipes ADD COLUMN share_token TEXT DEFAULT NULL;
    share_token = Column(String, nullable=True)

Base.metadata.create_all(bind=engine)

# ── Auth ──
security = HTTPBearer()

def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    token = credentials.credentials
    try:
        response = supabase.auth.get_user(token)
        return response.user
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid or expired token")

# ── App ──
app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
def home():
    return {"message": "Backend running"}

# ── Auth endpoints ──
@app.post("/auth/signup")
def signup(data: dict):
    try:
        response = supabase.auth.sign_up({
            "email": data["email"],
            "password": data["password"]
        })
        return {"message": "Signed up successfully. Please check your email to confirm your account."}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.post("/auth/login")
def login(data: dict):
    try:
        response = supabase.auth.sign_in_with_password({
            "email": data["email"],
            "password": data["password"]
        })
        return {
            "access_token": response.session.access_token,
            "user": {
                "id": response.user.id,
                "email": response.user.email
            }
        }
    except Exception as e:
        raise HTTPException(status_code=401, detail="Invalid email or password")

async def get_optional_user(authorization: Optional[str] = Header(None)):
    if not authorization:
        return None
    try:
        token = authorization.replace("Bearer ", "")
        user = supabase.auth.get_user(token)
        return user
    except:
        return None

# ── Helpers ──

def parse_labels(raw):
    # Safely parse a JSON string that may be None or missing.
    # Older rows in the DB won't have a labels value — default to empty list.
    if not raw:
        return []
    try:
        return json.loads(raw)
    except Exception:
        return []

def serialize_recipe(r):
    # Single place that converts a Recipe ORM row to a dict.
    # Used by every endpoint that returns recipe data so the shape
    # is always consistent.
    return {
        "id": r.id,
        "title": r.title,
        "ingredients": json.loads(r.ingredients),
        "instructions": json.loads(r.instructions),
        "notes": json.loads(r.notes),
        "language": r.language,
        "image_url": r.image_url,
        "labels": parse_labels(r.labels),
        "share_token": r.share_token,
        "created_at": r.created_at,
    }

# Words that indicate a null/null ingredient is a real ingredient
# (not a section label) — used by the post-processing safety net below.
INGREDIENT_WORDS = {
    "salt", "pepper", "water", "oil", "butter", "sugar", "flour",
    "milk", "cream", "eggs", "egg", "vanilla", "honey", "vinegar",
    "sauce", "stock", "broth", "juice", "zest", "garlic", "onion",
    "herbs", "spice", "seasoning", "taste", "needed", "optional",
}

def looks_like_section(name: str) -> bool:
    # Returns True if a null/null ingredient looks like a section label
    # that Gemini forgot to mark as {"type": "section"}.
    # Heuristics: short (≤4 words), no digits, no known ingredient words,
    # starts with a capital letter.
    words = name.strip().split()
    if len(words) > 4:
        return False
    if any(ch.isdigit() for ch in name):
        return False
    if {w.lower() for w in words} & INGREDIENT_WORDS:
        return False
    return name[0].isupper() if name else False

def fix_gemini_sections(ingredients: list) -> list:
    # Post-processing safety net: Gemini sometimes returns group labels
    # (e.g. "Oat Mixture", "For the sauce") as regular ingredients with
    # amount: null and unit: null instead of as section headers.
    # Promote any that match our heuristics to {"type": "section"}.
    cleaned = []
    for item in ingredients:
        if (
            isinstance(item, dict)
            and item.get("type") != "section"
            and item.get("amount") is None
            and item.get("unit") is None
            and looks_like_section(item.get("name", ""))
        ):
            cleaned.append({"type": "section", "text": item["name"]})
        else:
            cleaned.append(item)
    return cleaned

# ── Upload ──
@app.post("/upload")
async def upload(
    file: UploadFile = File(...),
    current_user=Depends(get_optional_user)):
    try:
        contents = await file.read()
        image_bytes = types.Part.from_bytes(data=contents, mime_type=file.content_type)

        prompt = """
        Look at this recipe image and extract the information into JSON.
        Return only valid JSON with exactly these keys:
        - title (string)
        - ingredients (list — see format below)
        - instructions (list — see format below)
        - notes (list of strings, can be empty)

        INGREDIENTS FORMAT:
        Each item in the ingredients list is EITHER a regular ingredient OR a section header.
        Nothing else is allowed.

        Regular ingredient — has a name and optionally a quantity/unit:
          {"amount": number or null, "unit": string or null, "name": string}

        Section header — use ONLY for labels that group the ingredients below them,
        such as "For the dough", "Oat Mixture", "Frosting", "Sauce".
        A section header is NOT an ingredient. It has no amount or unit:
          {"type": "section", "text": "Section name"}

        CRITICAL: If a line in the recipe is a group label (not an actual ingredient
        you would measure or add), it MUST be a section header, not an ingredient.

        WRONG — treating a group label as an ingredient:
          {"amount": null, "unit": null, "name": "Oat Mixture"}  <- NEVER do this
          {"amount": null, "unit": null, "name": "For the sauce"}  <- NEVER do this

        CORRECT:
          {"type": "section", "text": "Oat Mixture"}
          {"type": "section", "text": "For the sauce"}

        More ingredient examples:
          "2 cups flour"  -> {"amount": 2, "unit": "cup", "name": "flour"}
          "1/2 tsp salt"  -> {"amount": 0.5, "unit": "tsp", "name": "salt"}
          "2 eggs"        -> {"amount": 2, "unit": null, "name": "eggs"}
          "salt to taste" -> {"amount": null, "unit": null, "name": "salt to taste"}

        INSTRUCTIONS FORMAT:
        Each instruction is either a plain step string OR a section header object.
        - Regular step: "Mix the flour and butter until crumbly."
        - Section header: {"type": "section", "text": "Section name"}

        Use section headers in instructions only if the recipe clearly separates phases
        (e.g. "Make the sponge", "Assemble the cake").

        Each instruction step should be a complete sentence without any leading numbers.
        If there are no sections, use plain strings for all ingredients and instructions.
        If you cannot find a value, use an empty list.
        Return nothing except the JSON object.
        """

        response = client.models.generate_content(
            model="gemini-2.5-flash",
            contents=[prompt, image_bytes]
        )

        text = response.text.strip()
        if text.startswith("```"):
            text = text.split("\n", 1)[1]
            text = text.rsplit("```", 1)[0]

        data = json.loads(text)

        # Apply the section label safety net before returning to the frontend
        data["ingredients"] = fix_gemini_sections(data.get("ingredients", []))

        return data

    except json.JSONDecodeError:
        raise HTTPException(status_code=500, detail="Could not parse recipe structure. This usually happens because the image is difficult to read.")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/upload-image")
async def upload_image(
    file: UploadFile = File(...),
    current_user=Depends(get_current_user)
):
    try:
        contents = await file.read()
        # Give each file a unique path: userId/timestamp_filename
        # This prevents collisions if two users upload a file with the same name
        file_path = f"{current_user.id}/{datetime.utcnow().timestamp()}_{file.filename}"

        supabase.storage.from_("recipe-images").upload(
            file_path,
            contents,
            {"content-type": file.content_type}
        )

        # Get the public URL back so the frontend can display it
        url = supabase.storage.from_("recipe-images").get_public_url(file_path)
        return {"image_url": url}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# ── Recipes ──

@app.post("/recipes")
def save_recipe(data: dict, current_user=Depends(get_current_user)):
    db = SessionLocal()
    try:
        recipe = Recipe(
            user_id=current_user.id,
            title=data.get("title", "Untitled"),
            ingredients=json.dumps(data.get("ingredients", [])),
            instructions=json.dumps(data.get("instructions", [])),
            notes=json.dumps(data.get("notes", [])),
            language=data.get("language", "en"),
            image_url=data.get("image_url", None),
            labels=json.dumps(data.get("labels", [])),
        )
        db.add(recipe)
        db.commit()
        db.refresh(recipe)
        return serialize_recipe(recipe)
    finally:
        db.close()

@app.get("/recipes")
def get_recipes(current_user=Depends(get_current_user)):
    db = SessionLocal()
    try:
        recipes = db.query(Recipe).filter(
            Recipe.user_id == current_user.id
        ).order_by(Recipe.created_at.desc()).all()
        return [serialize_recipe(r) for r in recipes]
    finally:
        db.close()

@app.get("/recipes/{recipe_id}")
def get_recipe(recipe_id: int, current_user=Depends(get_current_user)):
    # Fetch a single recipe by ID — used by DetailView when navigating
    # directly to /recipe/:id (deep link, page refresh, sub-recipe open).
    db = SessionLocal()
    try:
        r = db.query(Recipe).filter(
            Recipe.id == recipe_id,
            Recipe.user_id == current_user.id
        ).first()
        if not r:
            raise HTTPException(status_code=404, detail="Recipe not found")
        return serialize_recipe(r)
    finally:
        db.close()

@app.put("/recipes/{recipe_id}")
def update_recipe(recipe_id: int, data: dict, current_user=Depends(get_current_user)):
    db = SessionLocal()
    try:
        recipe = db.query(Recipe).filter(
            Recipe.id == recipe_id,
            Recipe.user_id == current_user.id
        ).first()
        if not recipe:
            raise HTTPException(status_code=404, detail="Recipe not found")
        recipe.title = data.get("title", recipe.title)
        recipe.ingredients = json.dumps(data.get("ingredients", []))
        recipe.instructions = json.dumps(data.get("instructions", []))
        recipe.notes = json.dumps(data.get("notes", []))
        recipe.language = data.get("language", recipe.language)
        recipe.image_url = data.get("image_url", recipe.image_url)
        recipe.labels = json.dumps(data.get("labels", parse_labels(recipe.labels)))
        # Never clear an existing share_token on edit — the share URL stays stable
        db.commit()
        db.refresh(recipe)
        return {"message": "Updated"}
    finally:
        db.close()

@app.delete("/recipes/{recipe_id}")
def delete_recipe(recipe_id: int, current_user=Depends(get_current_user)):
    db = SessionLocal()
    try:
        recipe = db.query(Recipe).filter(
            Recipe.id == recipe_id,
            Recipe.user_id == current_user.id
        ).first()
        if not recipe:
            raise HTTPException(status_code=404, detail="Recipe not found")
        db.delete(recipe)
        db.commit()
        return {"message": "Deleted"}
    finally:
        db.close()

# ── Sharing ──

@app.post("/recipes/{recipe_id}/share")
def share_recipe(recipe_id: int, current_user=Depends(get_current_user)):
    # Generates a share token for the recipe if one doesn't exist yet,
    # then returns the token. The frontend constructs the full share URL.
    # Calling this endpoint again on an already-shared recipe returns the
    # same token so the share URL stays stable.
    db = SessionLocal()
    try:
        recipe = db.query(Recipe).filter(
            Recipe.id == recipe_id,
            Recipe.user_id == current_user.id
        ).first()
        if not recipe:
            raise HTTPException(status_code=404, detail="Recipe not found")
        if not recipe.share_token:
            # secrets.token_urlsafe generates a cryptographically random
            # URL-safe string — 16 bytes gives us 22 base64 characters,
            # which is short enough for a URL but long enough to be unguessable.
            recipe.share_token = secrets.token_urlsafe(16)
            db.commit()
            db.refresh(recipe)
        return {"share_token": recipe.share_token}
    finally:
        db.close()

@app.delete("/recipes/{recipe_id}/share")
def unshare_recipe(recipe_id: int, current_user=Depends(get_current_user)):
    # Revokes a share link by clearing the token. Anyone who had the old
    # link will get a 404 from GET /shared/:token after this.
    db = SessionLocal()
    try:
        recipe = db.query(Recipe).filter(
            Recipe.id == recipe_id,
            Recipe.user_id == current_user.id
        ).first()
        if not recipe:
            raise HTTPException(status_code=404, detail="Recipe not found")
        recipe.share_token = None
        db.commit()
        return {"message": "Share link revoked"}
    finally:
        db.close()

@app.get("/shared/{share_token}")
def get_shared_recipe(share_token: str):
    # Public endpoint — no auth required. Returns the recipe for the given
    # share token so anonymous visitors can view it.
    db = SessionLocal()
    try:
        r = db.query(Recipe).filter(
            Recipe.share_token == share_token
        ).first()
        if not r:
            raise HTTPException(status_code=404, detail="Recipe not found or link has been revoked")
        return serialize_recipe(r)
    finally:
        db.close()

# ── Translation / scaling / parsing ──

@app.post("/translate-text")
async def translate_text(body: dict):
    # Ingredients are now structured objects — extract just the names for translation
    # since amounts and units don't need translating
    raw_ingredients = body.get('ingredients', [])
    ingredient_strings = [
        f"{i.get('amount', '')} {i.get('unit', '')} {i.get('name', '')}".strip()
        if isinstance(i, dict)
        else i  # backward compatibility with plain strings
        for i in raw_ingredients
    ]

    recipe_text = f"""Title: {body.get('title')}
    Ingredients: {json.dumps(ingredient_strings)}
    Instructions: {json.dumps(body.get('instructions', []))}"""

    prompt = f"""Translate this recipe to Korean. Return only valid JSON with keys: title (string), ingredients (array of strings), instructions (array of strings). No markdown, no explanation.

{recipe_text}"""

    response = client.models.generate_content(
        model="gemini-2.5-flash",
        contents=[prompt]
    )
    text = response.text.strip()
    text = re.sub(r"^```json\s*", "", text)
    text = re.sub(r"\s*```$", "", text)
    return json.loads(text)

@app.post("/scale-text")
async def scale_text(body: dict):
    # Accepts plain ingredient strings — works for both English and Korean.
    # Client-side scaling handles structured English ingredients; this endpoint
    # only receives the cases that couldn't be parsed (including all Korean ingredients).
    ingredients = body.get("ingredients", [])
    original_servings = body.get("original_servings")
    target_servings = body.get("target_servings")

    prompt = f"""You are a recipe scaling assistant.
Rewrite the following ingredient list for {target_servings} servings instead of {original_servings} servings.
Scale all quantities proportionally. Keep the ingredient names and units the same — only change the amounts.
Return only a valid JSON array of strings, one string per ingredient, in the same order.
No markdown, no explanation — just the array.

Ingredients:
{json.dumps(ingredients)}
"""

    response = client.models.generate_content(
        model="gemini-2.5-flash",
        contents=[prompt]
    )

    text = response.text.strip()
    if text.startswith("```"):
        text = text.split("\n", 1)[1]
        text = text.rsplit("```", 1)[0]

    scaled = json.loads(text)
    return {"ingredients": scaled}

@app.post("/recipes/{recipe_id}/translate")
def translate_recipe(recipe_id: int, data: dict, current_user=Depends(get_current_user)):
    db = SessionLocal()
    try:
        recipe = db.query(Recipe).filter(
            Recipe.id == recipe_id,
            Recipe.user_id == current_user.id
        ).first()
        if not recipe:
            raise HTTPException(status_code=404, detail="Recipe not found")

        target_language = data.get("language", "Korean")

        prompt = f"""
        Translate the following recipe into {target_language}.
        Return only valid JSON with exactly these keys:
        - title (string)
        - ingredients (list of strings)
        - instructions (list of strings)

        Here is the recipe:
        Title: {recipe.title}
        Ingredients: {json.loads(recipe.ingredients)}
        Instructions: {json.loads(recipe.instructions)}

        Return nothing except the JSON object.
        """

        response = client.models.generate_content(
            model="gemini-2.5-flash",
            contents=[prompt]
        )

        text = response.text.strip()
        if text.startswith("```"):
            text = text.split("\n", 1)[1]
            text = text.rsplit("```", 1)[0]

        translated = json.loads(text)
        return translated

    except json.JSONDecodeError:
        raise HTTPException(status_code=500, detail="Could not parse translation")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        db.close()

@app.post("/parse-ingredients")
async def parse_ingredients(body: dict):
    # Accepts a list of raw ingredient strings that couldn't be parsed client-side
    # and returns a list of structured { amount, unit, name } objects.
    ingredients = body.get("ingredients", [])

    prompt = f"""Parse each ingredient string into a structured object with these keys:
    - amount: the numeric quantity as a number (e.g. 2, 0.5, 1.5), or null if there is none
    - unit: the unit of measurement normalized to singular lowercase (e.g. "cup", "tsp", "g"), or null if there is none
    - name: the ingredient name as a string

    Examples:
    "juice of 1 lemon" -> {{"amount": 1, "unit": null, "name": "lemon juice"}}
    "a handful of parsley" -> {{"amount": 1, "unit": "handful", "name": "parsley"}}
    "salt to taste" -> {{"amount": null, "unit": null, "name": "salt to taste"}}

    Return only a valid JSON array of objects, one per ingredient, in the same order.
    No markdown, no explanation, no wrapper object — just the array.

    Ingredients:
    {json.dumps(ingredients)}
    """

    response = client.models.generate_content(
        model="gemini-2.5-flash",
        contents=[prompt]
    )

    text = response.text.strip()
    if text.startswith("```"):
        text = text.split("\n", 1)[1]
        text = text.rsplit("```", 1)[0]

    parsed = json.loads(text)
    return {"ingredients": parsed}