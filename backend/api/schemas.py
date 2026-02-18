"""
Pydantic schemas for API request/response validation.
"""
from pydantic import BaseModel, Field
from typing import List, Optional
from datetime import datetime


# ================== Project Schemas ==================

class ProjectCreate(BaseModel):
    """Schema for creating a new project."""
    name: str = Field(..., min_length=1, max_length=255)
    description: Optional[str] = None


class ProjectResponse(BaseModel):
    """Schema for project response."""
    id: str
    name: str
    description: Optional[str]
    status: str
    created_at: datetime
    updated_at: datetime
    
    class Config:
        from_attributes = True


# ================== Class Schemas ==================

class ClassCreate(BaseModel):
    """Schema for creating a new class."""
    name: str = Field(..., min_length=1, max_length=100)
    color: str = Field(..., pattern=r'^#[0-9A-Fa-f]{6}$')  # Hex color


class ClassResponse(BaseModel):
    """Schema for class response."""
    id: int
    project_id: str
    name: str
    color: str
    
    class Config:
        from_attributes = True


# ================== Image Schemas ==================

class ImageResponse(BaseModel):
    """Schema for image response."""
    id: str
    project_id: str
    filename: str
    file_path: str
    width: int
    height: int
    status: str
    created_at: datetime
    
    class Config:
        from_attributes = True


# ================== Annotation Schemas ==================

class BBox(BaseModel):
    """Bounding box in YOLO format (normalized)."""
    x: float = Field(..., ge=0, le=1)  # Center X
    y: float = Field(..., ge=0, le=1)  # Center Y
    w: float = Field(..., ge=0, le=1)  # Width
    h: float = Field(..., ge=0, le=1)  # Height


class AnnotationCreate(BaseModel):
    """Schema for creating annotation."""
    image_id: str
    class_id: int
    bbox: BBox
    confidence: Optional[float] = None
    source: str = "manual"


class AnnotationResponse(BaseModel):
    """Schema for annotation response."""
    id: str
    image_id: str
    class_id: int
    bbox: dict
    confidence: Optional[float]
    source: str
    created_at: datetime
    
    class Config:
        from_attributes = True


# ================== Task Schemas ==================

class TaskStatus(BaseModel):
    """Schema for background task status."""
    task_id: str
    status: str  # "pending", "running", "completed", "failed"
    progress: Optional[float] = None  # 0-100
    message: Optional[str] = None
    result: Optional[dict] = None
