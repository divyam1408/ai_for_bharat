"""FastAPI application entry point."""

import os
import uuid
from contextlib import asynccontextmanager
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

from database import init_db
from routes.auth_routes import router as auth_router
from routes.patient_routes import router as patient_router
from routes.doctor_routes import router as doctor_router

FRONTEND_DIR = os.path.join(os.path.dirname(__file__), "..", "frontend")
UPLOADS_DIR = os.path.join(os.path.dirname(__file__), "uploads")

# Ensure uploads directory exists
os.makedirs(UPLOADS_DIR, exist_ok=True)

ALLOWED_EXTENSIONS = {".png", ".jpg", ".jpeg", ".gif", ".webp", ".pdf", ".doc", ".docx"}
MAX_FILE_SIZE = 10 * 1024 * 1024  # 10 MB


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Initialize database on startup."""
    await init_db()
    print("✅ Database initialized")
    yield


app = FastAPI(
    title="AI Healthcare Diagnosis System",
    description="Rural healthcare diagnostic platform with AI assistance",
    version="0.1.0",
    lifespan=lifespan,
)

# CORS for local development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include API routers
app.include_router(auth_router)
app.include_router(patient_router)
app.include_router(doctor_router)

# Serve uploaded files
app.mount("/uploads", StaticFiles(directory=UPLOADS_DIR), name="uploads")

# Serve frontend static files
app.mount("/js", StaticFiles(directory=os.path.join(FRONTEND_DIR, "js")), name="js")
app.mount("/static", StaticFiles(directory=FRONTEND_DIR), name="static")


@app.post("/api/upload")
async def upload_file(file: UploadFile = File(...)):
    """Upload an image or document attachment."""
    ext = os.path.splitext(file.filename or "")[1].lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"File type {ext} not allowed. Allowed: {', '.join(ALLOWED_EXTENSIONS)}",
        )

    contents = await file.read()
    if len(contents) > MAX_FILE_SIZE:
        raise HTTPException(status_code=400, detail="File too large. Max size: 10 MB")

    # Save with a unique name
    unique_name = f"{uuid.uuid4().hex}{ext}"
    file_path = os.path.join(UPLOADS_DIR, unique_name)
    with open(file_path, "wb") as f:
        f.write(contents)

    return {"url": f"/uploads/{unique_name}", "filename": file.filename}


@app.get("/")
async def serve_frontend():
    """Serve the frontend SPA."""
    return FileResponse(os.path.join(FRONTEND_DIR, "index.html"))


@app.get("/index.css")
async def serve_css():
    """Serve the main CSS file."""
    return FileResponse(os.path.join(FRONTEND_DIR, "index.css"))
