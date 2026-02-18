"""
Database models using SQLAlchemy.
Simple and straightforward schema.
"""
from sqlalchemy import Column, String, Integer, Float, ForeignKey, DateTime, JSON, Enum as SQLEnum
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import relationship
from datetime import datetime
import enum
import uuid


Base = declarative_base()


def generate_uuid():
    """Generate a UUID string."""
    return str(uuid.uuid4())


class ProjectStatus(str, enum.Enum):
    """Project workflow statuses."""
    UPLOADING = "uploading"
    EMBEDDING = "embedding"
    ANNOTATING = "annotating"
    TRAINING = "training"
    AUTO_ANNOTATING = "auto_annotating"
    COMPLETED = "completed"


class ImageStatus(str, enum.Enum):
    """Image annotation statuses."""
    UNANNOTATED = "unannotated"
    SELECTED = "selected"  # Selected by active learning
    ANNOTATED = "annotated"  # Manually annotated
    AUTO_ANNOTATED = "auto_annotated"  # Auto-annotated by model


class Project(Base):
    """Project table - each project is one annotation job."""
    __tablename__ = "projects"
    
    id = Column(String, primary_key=True, default=generate_uuid)
    name = Column(String(255), nullable=False)
    description = Column(String, nullable=True)
    status = Column(SQLEnum(ProjectStatus), default=ProjectStatus.UPLOADING)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relationships
    images = relationship("Image", back_populates="project", cascade="all, delete-orphan")
    classes = relationship("Class", back_populates="project", cascade="all, delete-orphan")


class Image(Base):
    """Image table - stores all uploaded images."""
    __tablename__ = "images"
    
    id = Column(String, primary_key=True, default=generate_uuid)
    project_id = Column(String, ForeignKey("projects.id", ondelete="CASCADE"), nullable=False)
    filename = Column(String(255), nullable=False)
    file_path = Column(String, nullable=False)
    width = Column(Integer, nullable=False)
    height = Column(Integer, nullable=False)
    status = Column(SQLEnum(ImageStatus), default=ImageStatus.UNANNOTATED)
    created_at = Column(DateTime, default=datetime.utcnow)
    
    # Relationships
    project = relationship("Project", back_populates="images")
    annotations = relationship("Annotation", back_populates="image", cascade="all, delete-orphan")
    embedding = relationship("Embedding", back_populates="image", uselist=False, cascade="all, delete-orphan")


class Class(Base):
    """Class table - stores class definitions for each project."""
    __tablename__ = "classes"
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    project_id = Column(String, ForeignKey("projects.id", ondelete="CASCADE"), nullable=False)
    name = Column(String(100), nullable=False)
    color = Column(String(7), nullable=False)  # Hex color like #FF5733
    
    # Relationships
    project = relationship("Project", back_populates="classes")
    annotations = relationship("Annotation", back_populates="class_obj")


class Annotation(Base):
    """Annotation table - stores bounding boxes."""
    __tablename__ = "annotations"
    
    id = Column(String, primary_key=True, default=generate_uuid)
    image_id = Column(String, ForeignKey("images.id", ondelete="CASCADE"), nullable=False)
    class_id = Column(Integer, ForeignKey("classes.id", ondelete="CASCADE"), nullable=False)
    
    # Bounding box in YOLO format: center_x, center_y, width, height (normalized 0-1)
    bbox = Column(JSON, nullable=False)  # {"x": 0.5, "y": 0.5, "w": 0.2, "h": 0.3}
    
    confidence = Column(Float, nullable=True)  # Null for manual, score for auto
    source = Column(String(50), default="manual")  # "manual" or "auto"
    created_at = Column(DateTime, default=datetime.utcnow)
    
    # Relationships
    image = relationship("Image", back_populates="annotations")
    class_obj = relationship("Class", back_populates="annotations")


class Embedding(Base):
    """Embedding table - stores feature vectors (optional, could use FAISS only)."""
    __tablename__ = "embeddings"
    
    id = Column(String, primary_key=True, default=generate_uuid)
    image_id = Column(String, ForeignKey("images.id", ondelete="CASCADE"), nullable=False, unique=True)
    model_name = Column(String(100), nullable=False)  # "clip", "dinov2", etc.
    
    # Note: Actual vector stored in FAISS, not in DB for efficiency
    # This table just tracks which images have embeddings
    created_at = Column(DateTime, default=datetime.utcnow)
    
    # Relationships
    image = relationship("Image", back_populates="embedding")
