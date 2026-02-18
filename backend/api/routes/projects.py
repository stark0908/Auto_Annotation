"""
Project routes - CRUD operations for projects.
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from db.database import get_db
from db import crud
from api.schemas import ProjectCreate, ProjectResponse


router = APIRouter(prefix="/projects", tags=["projects"])


@router.post("/", response_model=ProjectResponse)
def create_project(project: ProjectCreate, db: Session = Depends(get_db)):
    """Create a new annotation project."""
    db_project = crud.create_project(db, name=project.name, description=project.description)
    return db_project


@router.get("/", response_model=List[ProjectResponse])
def list_projects(db: Session = Depends(get_db)):
    """Get all projects."""
    return crud.get_all_projects(db)


@router.get("/{project_id}", response_model=ProjectResponse)
def get_project(project_id: str, db: Session = Depends(get_db)):
    """Get project by ID."""
    project = crud.get_project(db, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    return project


@router.delete("/{project_id}")
def delete_project(project_id: str, db: Session = Depends(get_db)):
    """Delete a project."""
    project = crud.get_project(db, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    db.delete(project)
    db.commit()
    
    return {"message": "Project deleted"}
