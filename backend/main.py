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
        - ingredients (list of strings)
        - instructions (list of strings)
        - notes (list of strings, can be empty)

        Each instruction should be a complete step without any leading numbers.
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
        )
        db.add(recipe)
        db.commit()
        db.refresh(recipe)
        return {
            "id": recipe.id,
            "title": recipe.title,
            "ingredients": json.loads(recipe.ingredients),
            "instructions": json.loads(recipe.instructions),
            "notes": json.loads(recipe.notes),
            "language": recipe.language,
            "image_url": recipe.image_url,
            "created_at": recipe.created_at,
        }
    finally:
        db.close()

@app.post("/translate-text")
async def translate_text(body: dict):
    recipe_text = f"""Title: {body.get('title')}
Ingredients: {json.dumps(body.get('ingredients', []))}
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
    # Accept raw ingredients + serving counts directly, no DB lookup needed.
    # This lets guests and any caller scale without needing a saved recipe ID.
    ingredients = body.get("ingredients", [])
    original_servings = body.get("original_servings")
    target_servings = body.get("target_servings")

    prompt = f"""You are a recipe scaling assistant.
    Rewrite the following ingredient list for {target_servings} servings instead of {original_servings} servings.
    Scale all quantities proportionally. Keep the ingredient names and units the same — only change the amounts.
    Return only a valid JSON array of strings, one string per ingredient.
    No markdown, no explanation, no wrapper object — just the array.

    Ingredients:
    {json.dumps(ingredients)}
    """

    response = client.models.generate_content(
        model="gemini-2.5-flash",
        contents=[prompt]
    )

    text = response.text.strip()
    # Strip markdown code fences if Gemini adds them, same pattern used elsewhere
    if text.startswith("```"):
        text = text.split("\n", 1)[1]
        text = text.rsplit("```", 1)[0]

    scaled = json.loads(text)
    return {"ingredients": scaled}

@app.get("/recipes")
def get_recipes(current_user=Depends(get_current_user)):
    db = SessionLocal()
    try:
        recipes = db.query(Recipe).filter(
            Recipe.user_id == current_user.id
        ).order_by(Recipe.created_at.desc()).all()
        return [
            {
                "id": r.id,
                "title": r.title,
                "ingredients": json.loads(r.ingredients),
                "instructions": json.loads(r.instructions),
                "notes": json.loads(r.notes),
                "language": r.language,
                "image_url": r.image_url,
                "created_at": r.created_at,
            }
            for r in recipes
        ]
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