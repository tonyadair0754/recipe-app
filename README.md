# recipe-app

A multilingual recipe manager. Scan a recipe from a photo, type one in from scratch, save your collection, and translate between English and Korean.

## Features

- Scan printed or handwritten recipe images using Google Gemini's vision API
- Manual recipe entry with drag-and-drop ingredient and instruction reordering
- Save, edit, and delete recipes from a personal collection
- Translate any recipe to Korean with one click
- Search your collection by title

## Tech stack

- **Frontend:** React
- **Backend:** Python, FastAPI
- **Database:** SQLite via SQLAlchemy
- **AI:** Google Gemini 2.5 Flash

## Running locally

### Prerequisites
- Python 3.9+
- Node.js 18+
- A Google Gemini API key from [Google AI Studio](https://aistudio.google.com)

### Backend

```bash
cd backend
pip install fastapi uvicorn sqlalchemy pillow google-genai python-dotenv
```

Create a `.env` file in the backend folder:
GEMINI_API_KEY=your_key_here

Start the server:

```bash
uvicorn main:app --reload
```

### Frontend

```bash
cd frontend
npm install
npm start
```

The app runs at `http://localhost:3000`.

## Project structure
recipe-app/
├── backend/
│   └── main.py          # FastAPI server, database models, Gemini integration
└── frontend/src/
├── api/             # All backend communication
├── components/      # Reusable UI components
├── views/           # Page-level components
└── App.js           # Navigation and top-level state