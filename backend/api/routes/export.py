"""
Export routes - export annotations in various formats.
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from pathlib import Path
from db.database import get_db
from db import crud
from core.export import AnnotationExporter
from config import settings


router = APIRouter(prefix="/export", tags=["export"])


@router.get("/{project_id}/yolo")
def export_yolo(project_id: str, db: Session = Depends(get_db)):
    """Export annotations in YOLO format."""
    project = crud.get_project(db, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    # Get all images and annotations
    images = crud.get_project_images(db, project_id)
    classes = crud.get_project_classes(db, project_id)
    
    all_annotations = []
    for img in images:
        anns = crud.get_image_annotations(db, img.id)
        for ann in anns:
            all_annotations.append({
                "image_id": ann.image_id,
                "class_id": ann.class_id,
                "bbox": ann.bbox
            })
    
    # Convert to dict format
    images_dict = [
        {
            "id": img.id,
            "filename": img.filename,
            "file_path": img.file_path
        }
        for img in images
    ]
    
    classes_dict = [
        {"id": cls.id, "name": cls.name}
        for cls in classes
    ]
    
    # Export
    project_dir = Path(settings.DATA_DIR) / "projects" / project_id
    exporter = AnnotationExporter(project_id, str(project_dir))
    export_path = exporter.export_yolo(images_dict, all_annotations, classes_dict)
    
    return {
        "message": "YOLO export completed",
        "path": export_path
    }


@router.get("/{project_id}/coco")
def export_coco(project_id: str, db: Session = Depends(get_db)):
    """Export annotations in COCO format."""
    project = crud.get_project(db, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    # Get all images and annotations
    images = crud.get_project_images(db, project_id)
    classes = crud.get_project_classes(db, project_id)
    
    all_annotations = []
    for img in images:
        anns = crud.get_image_annotations(db, img.id)
        for ann in anns:
            all_annotations.append({
                "image_id": ann.image_id,
                "class_id": ann.class_id,
                "bbox": ann.bbox
            })
    
    # Convert to dict format
    images_dict = [
        {
            "id": img.id,
            "filename": img.filename,
            "file_path": img.file_path,
            "width": img.width,
            "height": img.height
        }
        for img in images
    ]
    
    classes_dict = [
        {"id": cls.id, "name": cls.name}
        for cls in classes
    ]
    
    # Export
    project_dir = Path(settings.DATA_DIR) / "projects" / project_id
    exporter = AnnotationExporter(project_id, str(project_dir))
    export_path = exporter.export_coco(images_dict, all_annotations, classes_dict)
    
    return {
        "message": "COCO export completed",
        "path": export_path,
        "download_url": f"/export/{project_id}/coco/download"
    }


@router.get("/{project_id}/coco/download")
def download_coco(project_id: str):
    """Download COCO export file."""
    project_dir = Path(settings.DATA_DIR) / "projects" / project_id
    coco_file = project_dir / "exports" / "coco_export.json"
    
    if not coco_file.exists():
        raise HTTPException(status_code=404, detail="Export file not found")
    
    return FileResponse(
        path=str(coco_file),
        filename=f"{project_id}_coco.json",
        media_type="application/json"
    )
