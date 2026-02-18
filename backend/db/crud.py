"""
CRUD operations for database.
Simple helper functions to avoid repeating SQLAlchemy queries.
"""
from sqlalchemy.orm import Session
from db.models import Project, Image, Class, Annotation, Embedding, ProjectStatus, ImageStatus
from typing import List, Optional


# ================== Project Operations ==================

def create_project(db: Session, name: str, description: str = None) -> Project:
    """Create a new project."""
    project = Project(name=name, description=description)
    db.add(project)
    db.commit()
    db.refresh(project)
    return project


def get_project(db: Session, project_id: str) -> Optional[Project]:
    """Get project by ID."""
    return db.query(Project).filter(Project.id == project_id).first()


def get_all_projects(db: Session) -> List[Project]:
    """Get all projects."""
    return db.query(Project).order_by(Project.created_at.desc()).all()


def update_project_status(db: Session, project_id: str, status: ProjectStatus):
    """Update project status."""
    project = get_project(db, project_id)
    if project:
        project.status = status
        db.commit()
        db.refresh(project)
    return project


# ================== Image Operations ==================

def create_image(db: Session, project_id: str, filename: str, file_path: str, 
                width: int, height: int) -> Image:
    """Create a new image record."""
    image = Image(
        project_id=project_id,
        filename=filename,
        file_path=file_path,
        width=width,
        height=height
    )
    db.add(image)
    db.commit()
    db.refresh(image)
    return image


def get_image(db: Session, image_id: str) -> Optional[Image]:
    """Get image by ID."""
    return db.query(Image).filter(Image.id == image_id).first()


def get_project_images(db: Session, project_id: str, status: ImageStatus = None) -> List[Image]:
    """Get all images for a project, optionally filtered by status."""
    query = db.query(Image).filter(Image.project_id == project_id)
    if status:
        query = query.filter(Image.status == status)
    return query.all()


def update_image_status(db: Session, image_id: str, status: ImageStatus):
    """Update image status."""
    image = get_image(db, image_id)
    if image:
        image.status = status
        db.commit()
        db.refresh(image)
    return image


# ================== Class Operations ==================

def create_class(db: Session, project_id: str, name: str, color: str) -> Class:
    """Create a new class."""
    class_obj = Class(project_id=project_id, name=name, color=color)
    db.add(class_obj)
    db.commit()
    db.refresh(class_obj)
    return class_obj


def get_project_classes(db: Session, project_id: str) -> List[Class]:
    """Get all classes for a project."""
    return db.query(Class).filter(Class.project_id == project_id).all()


# ================== Annotation Operations ==================

def create_annotation(db: Session, image_id: str, class_id: int, bbox: dict, 
                     confidence: float = None, source: str = "manual") -> Annotation:
    """Create a new annotation."""
    annotation = Annotation(
        image_id=image_id,
        class_id=class_id,
        bbox=bbox,
        confidence=confidence,
        source=source
    )
    db.add(annotation)
    db.commit()
    db.refresh(annotation)
    return annotation


def get_image_annotations(db: Session, image_id: str) -> List[Annotation]:
    """Get all annotations for an image."""
    return db.query(Annotation).filter(Annotation.image_id == image_id).all()


def delete_image_annotations(db: Session, image_id: str):
    """Delete all annotations for an image."""
    db.query(Annotation).filter(Annotation.image_id == image_id).delete()
    db.commit()


# ================== Embedding Operations ==================

def create_embedding_record(db: Session, image_id: str, model_name: str) -> Embedding:
    """Create embedding record (actual vector stored in FAISS)."""
    embedding = Embedding(image_id=image_id, model_name=model_name)
    db.add(embedding)
    db.commit()
    db.refresh(embedding)
    return embedding


def get_images_without_embeddings(db: Session, project_id: str) -> List[Image]:
    """Get images that don't have embeddings yet."""
    return db.query(Image).filter(
        Image.project_id == project_id,
        ~Image.embedding.has()
    ).all()
