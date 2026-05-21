# recipe-app

A multilingual recipe manager. Scan a recipe from a photo, type one in from scratch, save your collection, and translate between English and Korean.

## Features

- Scan printed or handwritten recipe images using Google Gemini's vision API
- Manual recipe entry with drag-and-drop ingredient and instruction reordering
- Ingredient normalization — free-text ingredients are parsed into structured `{ amount, unit, name }` objects using a client-side parser with Gemini fallback
- Scale ingredient quantities to any serving count — math-based for most ingredients, Gemini-assisted for ambiguous ones
- Add photos to recipes and individual steps
- Save, edit, and delete recipes from a personal collection
- Translate any recipe to Korean with one click
- Search your collection by title, ingredient, or instruction
- Guest mode — use the app without an account, with recipes stored locally in the browser
- Automatic guest-to-account migration when signing up

## Tech stack

- **Frontend:** React
- **Backend:** Python, FastAPI
- **Database:** PostgreSQL via Supabase
- **Auth:** Supabase Auth (JWT)
- **AI:** Google Gemini 2.5 Flash
- **Image storage:** Supabase Storage
- **Backend deployment:** Render
- **Frontend deployment:** Vercel

## Running locally

### Prerequisites
- Python 3.11+
- Node.js 18+
- A Google Gemini API key from [Google AI Studio](https://aistudio.google.com)
- A Supabase project with a `recipe-images` storage bucket

### Backend

```bash
cd backend
pip install -r requirements.txt
```

Create a `.env` file in the `backend` folder:

```
GEMINI_API_KEY=your_key_here
SUPABASE_URL=https://xxxxxxxxxxxx.supabase.co
SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_KEY=your_service_key
DATABASE_URL=postgresql://postgres.xxxx:PASSWORD@aws-us-east-2.pooler.supabase.com:6543/postgres
```

Start the server:

```bash
uvicorn main:app --reload
```

### Frontend

Create a `.env` file in the `frontend` folder:

```
REACT_APP_API_URL=http://127.0.0.1:8000
```

Then:

```bash
cd frontend
npm install
npm start
```

The app runs at `http://localhost:3000`.

## Project structure

```
recipe-app/
├── backend/
│   ├── main.py              # FastAPI server (all endpoints)
│   ├── requirements.txt
│   └── Dockerfile           # Render deployment config
└── frontend/src/
    ├── api/
    │   └── index.js         # All backend communication
    ├── components/
    │   ├── EditableList.jsx  # Drag-and-drop list
    │   └── RecipeEditor.jsx  # Recipe editor with ingredient parsing
    ├── context/
    │   └── AuthContext.js   # Auth state, guest mode, backend health check
    ├── utils/
    │   ├── imageUtils.js    # Base64 image conversion
    │   ├── parseUtils.js    # Ingredient parsing and formatting
    │   └── scaleUtils.js    # Client-side ingredient scaling
    ├── views/
    │   ├── AuthView.jsx     # Login / signup / guest entry
    │   ├── HomeView.jsx     # Scan or write a recipe
    │   ├── CollectionView.jsx
    │   └── DetailView.jsx   # View, edit, translate, scale
    └── App.js               # Navigation and top-level state
```

## Notes

- The backend is hosted on Render's free tier, which spins down after 15 minutes of inactivity. The app shows a "waking up" message during cold starts (~30 seconds).
- Gemini 2.5 Flash has a limit of 20 requests/day on the free tier. Ingredient parsing and scaling are designed to minimize API calls by handling common cases client-side.
- Supabase Storage requires authentication — guest images are stored as base64 in localStorage and in the database on migration.
