"""
Image routes - upload and manage images.
"""
from fastapi import APIRouter, Depends, UploadFile, File, HTTPException
from sqlalchemy.orm import Session
from typing import List
import shutil
from pathlib import Path
from db.database import get_db
from db import crud
from api.schemas import ImageResponse
from core.dataset_processor import DatasetProcessor
from tasks.celery_app import generate_embeddings_task


router = APIRouter(prefix="/images", tags=["images"])


@router.post("/{project_id}/upload")
def upload_images(
    project_id: str,
    files: List[UploadFile] = File(...),
    db: Session = Depends(get_db)
):
    """Upload images to a project."""
    # Check project exists
    project = crud.get_project(db, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    # Initialize processor
    processor = DatasetProcessor(project_id)
    
    uploaded = []
    errors = []
    
    for file in files:
        try:
            # Save uploaded file temporarily
            temp_path = f"/tmp/{file.filename}"
            with open(temp_path, "wb") as f:
                shutil.copyfileobj(file.file, f)
            
            # Process the file
            result = processor.process_uploaded_file(temp_path, file.filename)
            
            if result["success"]:
                # Create image record in DB
                img = crud.create_image(
                    db,
                    project_id=project_id,
                    filename=result["filename"],
                    file_path=result["file_path"],
                    width=result["width"],
                    height=result["height"]
                )
                uploaded.append(img.filename)
            else:
                errors.append({
                    "filename": file.filename,
                    "error": result["error"]
                })
            
            # Clean up temp file
            Path(temp_path).unlink(missing_ok=True)
        
        except Exception as e:
            errors.append({
                "filename": file.filename,
                "error": str(e)
            })
    
    return {
        "uploaded": len(uploaded),
        "errors": len(errors),
        "files": uploaded,
        "error_details": errors
    }


@router.get("/{project_id}", response_model=List[ImageResponse])
def list_images(project_id: str, status: str = None, db: Session = Depends(get_db)):
    """Get all images for a project, optionally filtered by status."""
    from db.models import ImageStatus
    
    status_enum = None
    if status:
        try:
            status_enum = ImageStatus[status.upper()]
        except KeyError:
            raise HTTPException(status_code=400, detail=f"Invalid status: {status}")
    
    images = crud.get_project_images(db, project_id, status=status_enum)
    return images


@router.get("/{project_id}/embedding-stats")
def get_embedding_stats(project_id: str, db: Session = Depends(get_db)):
    """Get embedding statistics for a project."""
    from db.models import Image, Embedding
    
    total = db.query(Image).filter(Image.project_id == project_id).count()
    with_embeddings = db.query(Embedding).join(Image).filter(Image.project_id == project_id).count()
    
    return {
        "total": total,
        "with_embeddings": with_embeddings,
        "ready": with_embeddings > 0 and with_embeddings == total
    }



@router.post("/{project_id}/generate-embeddings")
def generate_embeddings(project_id: str, db: Session = Depends(get_db)):
    """Start background task to generate embeddings."""
    project = crud.get_project(db, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    # Start Celery task
    task = generate_embeddings_task.delay(project_id)
    
    return {
        "message": "Embedding generation started",
        "task_id": task.id
    }
