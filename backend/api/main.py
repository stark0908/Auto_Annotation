"""
Main FastAPI application.
Simple and straightforward - includes all routes.
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pathlib import Path
from db.database import init_db
from api.routes import projects, images, active_learning, annotations, training, export, serve


# Create FastAPI app
app = FastAPI(
    title="Auto-Annotation Platform API",
    description="Intelligent annotation platform with active learning and few-shot detection",
    version="1.0.0"
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include API routers
app.include_router(projects.router, prefix="/api")
app.include_router(images.router, prefix="/api")
app.include_router(active_learning.router, prefix="/api")
app.include_router(annotations.router, prefix="/api")
app.include_router(training.router, prefix="/api")
app.include_router(export.router, prefix="/api")
app.include_router(serve.router, prefix="/api")

# Serve static frontend files
FRONTEND_DIR = Path("/frontend/static")
if FRONTEND_DIR.exists():
    app.mount("/static", StaticFiles(directory=str(FRONTEND_DIR)), name="static")


@app.on_event("startup")
def startup():
    """Initialize database on startup."""
    print("🚀 Starting Auto-Annotation Platform API...")
    init_db()
    print("✅ Database initialized!")


@app.get("/")
def root():
    """Serve the frontend SPA."""
    index_file = FRONTEND_DIR / "index.html"
    if index_file.exists():
        return FileResponse(str(index_file))
    return {
        "message": "Auto-Annotation Platform API",
        "status": "running",
        "docs": "/docs"
    }


@app.get("/health")
def health_check():
    """Health check endpoint."""
    return {"status": "healthy"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
