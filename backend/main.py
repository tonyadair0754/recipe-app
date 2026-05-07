from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from google import genai
from google.genai import types
from dotenv import load_dotenv
from sqlalchemy import create_engine, Column, Integer, String, DateTime
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from datetime import datetime
import io
import os
import json

load_dotenv()
client = genai.Client(api_key=os.getenv("GEMINI_API_KEY"))

# --- Database setup ---
DATABASE_URL = "sqlite:///./recipes.db"
engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(bind=engine)
Base = declarative_base()

class Recipe(Base):
    __tablename__ = "recipes"
    id = Column(Integer, primary_key=True, index=True)
    title = Column(String)
    ingredients = Column(String)
    instructions = Column(String)
    notes = Column(String)
    language = Column(String, default="en")
    created_at = Column(DateTime, default=datetime.utcnow)

Base.metadata.create_all(bind=engine)

# --- App setup ---
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

@app.post("/upload")
async def upload(file: UploadFile = File(...)):
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
        raise HTTPException(status_code=500, detail="Could not parse recipe structure")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/recipes")
def save_recipe(data: dict):
    db = SessionLocal()
    try:
        recipe = Recipe(
            title=data.get("title", "Untitled"),
            ingredients=json.dumps(data.get("ingredients", [])),
            instructions=json.dumps(data.get("instructions", [])),
            notes=json.dumps(data.get("notes", [])),
            language=data.get("language", "en"),
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
            "created_at": recipe.created_at,
        }
    finally:
        db.close()

@app.get("/recipes")
def get_recipes():
    db = SessionLocal()
    try:
        recipes = db.query(Recipe).order_by(Recipe.created_at.desc()).all()
        return [
            {
                "id": r.id,
                "title": r.title,
                "ingredients": json.loads(r.ingredients),
                "instructions": json.loads(r.instructions),
                "notes": json.loads(r.notes),
                "language": r.language,
                "created_at": r.created_at,
            }
            for r in recipes
        ]
    finally:
        db.close()

@app.delete("/recipes/{recipe_id}")
def delete_recipe(recipe_id: int):
    db = SessionLocal()
    try:
        recipe = db.query(Recipe).filter(Recipe.id == recipe_id).first()
        if not recipe:
            raise HTTPException(status_code=404, detail="Recipe not found")
        db.delete(recipe)
        db.commit()
        return {"message": "Deleted"}
    finally:
        db.close()

@app.put("/recipes/{recipe_id}")
def update_recipe(recipe_id: int, data: dict):
    db = SessionLocal()
    try:
        recipe = db.query(Recipe).filter(Recipe.id == recipe_id).first()
        if not recipe:
            raise HTTPException(status_code=404, detail="Recipe not found")
        recipe.title = data.get("title", recipe.title)
        recipe.ingredients = json.dumps(data.get("ingredients", []))
        recipe.instructions = json.dumps(data.get("instructions", []))
        recipe.notes = json.dumps(data.get("notes", []))
        db.commit()
        db.refresh(recipe)
        return {"message": "Updated"}
    finally:
        db.close()

@app.post("/recipes/{recipe_id}/translate")
def translate_recipe(recipe_id: int, data: dict):
    db = SessionLocal()
    try:
        recipe = db.query(Recipe).filter(Recipe.id == recipe_id).first()
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