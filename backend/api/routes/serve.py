"""
Serve routes - serve image files to the frontend.
"""
from fastapi import APIRouter, HTTPException, Depends
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from pathlib import Path
from db.database import get_db
from db import crud


router = APIRouter(prefix="/serve", tags=["serve"])


@router.get("/image/{image_id}")
def serve_image(image_id: str, db: Session = Depends(get_db)):
    """Serve an image file by its ID."""
    image = crud.get_image(db, image_id)
    if not image:
        raise HTTPException(status_code=404, detail="Image not found")
    
    file_path = Path(image.file_path)
    if not file_path.exists():
        # Handle path mismatch from old DB entries
        from config import settings
        parts = str(file_path).replace('\\', '/')
        if 'projects/' in parts:
            rel = parts[parts.index('projects/'):]
            file_path = Path(settings.DATA_DIR) / rel
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="Image file not found on disk")
    
    # Determine media type
    suffix = file_path.suffix.lower()
    media_types = {
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".png": "image/png",
        ".bmp": "image/bmp",
        ".webp": "image/webp",
        ".tiff": "image/tiff",
    }
    media_type = media_types.get(suffix, "image/jpeg")
    
    return FileResponse(path=str(file_path), media_type=media_type)
