"""
Annotation routes - save and retrieve annotations.
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from db.database import get_db
from db import crud
from db.models import ImageStatus
from api.schemas import AnnotationCreate, AnnotationResponse, ClassCreate, ClassResponse


router = APIRouter(prefix="/annotations", tags=["annotations"])


# ==================== Class Management ====================

@router.post("/{project_id}/classes", response_model=ClassResponse)
def create_class(project_id: str, class_data: ClassCreate, db: Session = Depends(get_db)):
    """Create a new class for a project."""
    project = crud.get_project(db, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    cls = crud.create_class(db, project_id, class_data.name, class_data.color)
    return cls


@router.get("/{project_id}/classes", response_model=List[ClassResponse])
def list_classes(project_id: str, db: Session = Depends(get_db)):
    """Get all classes for a project."""
    return crud.get_project_classes(db, project_id)


@router.delete("/{project_id}/classes/{class_id}")
def delete_class(project_id: str, class_id: int, db: Session = Depends(get_db)):
    """Delete a class from a project."""
    from db.models import Class as ClassModel
    cls = db.query(ClassModel).filter(ClassModel.id == class_id, ClassModel.project_id == project_id).first()
    if not cls:
        raise HTTPException(status_code=404, detail="Class not found")
    db.delete(cls)
    db.commit()
    return {"message": f"Class '{cls.name}' deleted"}



# ==================== Annotation Management ====================

@router.post("/", response_model=AnnotationResponse)
def create_annotation(annotation: AnnotationCreate, db: Session = Depends(get_db)):
    """Create a new annotation."""
    # Verify image exists
    image = crud.get_image(db, annotation.image_id)
    if not image:
        raise HTTPException(status_code=404, detail="Image not found")
    
    # Create annotation
    ann = crud.create_annotation(
        db,
        image_id=annotation.image_id,
        class_id=annotation.class_id,
        bbox=annotation.bbox.model_dump(),
        confidence=annotation.confidence,
        source=annotation.source
    )
    
    # Update image status to annotated (if manual annotation)
    if annotation.source == "manual":
        crud.update_image_status(db, annotation.image_id, ImageStatus.ANNOTATED)
    
    return ann


@router.get("/image/{image_id}", response_model=List[AnnotationResponse])
def get_image_annotations(image_id: str, db: Session = Depends(get_db)):
    """Get all annotations for an image."""
    return crud.get_image_annotations(db, image_id)


@router.delete("/image/{image_id}")
def delete_image_annotations(image_id: str, db: Session = Depends(get_db)):
    """Delete all annotations for an image."""
    crud.delete_image_annotations(db, image_id)
    
    # Reset image status
    crud.update_image_status(db, image_id, ImageStatus.UNANNOTATED)
    
    return {"message": "Annotations deleted"}


@router.post("/batch")
def create_batch_annotations(annotations: List[AnnotationCreate], db: Session = Depends(get_db)):
    """Create multiple annotations at once."""
    created = []
    
    for ann in annotations:
        db_ann = crud.create_annotation(
            db,
            image_id=ann.image_id,
            class_id=ann.class_id,
            bbox=ann.bbox.model_dump(),
            confidence=ann.confidence,
            source=ann.source
        )
        created.append(db_ann.id)
        
        # Update image status
        if ann.source == "manual":
            crud.update_image_status(db, ann.image_id, ImageStatus.ANNOTATED)
    
    return {
        "created": len(created),
        "annotation_ids": created
    }
