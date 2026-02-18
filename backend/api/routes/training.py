"""
Training routes - train models and auto-annotate.
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from db.database import get_db
from db import crud
from tasks.celery_app import train_model_task, auto_annotate_task
from celery.result import AsyncResult


router = APIRouter(prefix="/training", tags=["training"])


@router.post("/{project_id}/train")
def start_training(
    project_id: str,
    epochs: int = Query(50, ge=1, le=200),
    batch_size: int = Query(16, ge=1, le=64),
    db: Session = Depends(get_db)
):
    """Start model training."""
    project = crud.get_project(db, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    # Start training task
    task = train_model_task.delay(project_id, epochs, batch_size)
    
    return {
        "message": "Training started",
        "task_id": task.id
    }


@router.post("/{project_id}/auto-annotate")
def start_auto_annotation(
    project_id: str,
    confidence_threshold: float = Query(0.25, ge=0.0, le=1.0),
    db: Session = Depends(get_db)
):
    """Start auto-annotation."""
    project = crud.get_project(db, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    # Start auto-annotation task
    task = auto_annotate_task.delay(project_id, confidence_threshold)
    
    return {
        "message": "Auto-annotation started",
        "task_id": task.id
    }


@router.get("/task/{task_id}")
def get_task_status(task_id: str):
    """Get status of a background task."""
    task = AsyncResult(task_id)
    
    # Check if task exists in the queue/is being processed
    # PENDING can mean either "not started" or "task doesn't exist"
    # If we have the task_id from our API, it's likely running
    if task.state == "PENDING":
        # Check if task is actually in queue
        from tasks.celery_app import celery_app
        active = celery_app.control.inspect().active()
        reserved = celery_app.control.inspect().reserved()
        
        # Check if task is in active or reserved
        is_active = False
        if active:
            for worker, tasks in active.items():
                if any(t['id'] == task_id for t in tasks):
                    is_active = True
                    break
        
        if not is_active and reserved:
            for worker, tasks in reserved.items():
                if any(t['id'] == task_id for t in tasks):
                    is_active = True
                    break
        
        response = {
            "task_id": task_id,
            "status": "running" if is_active else "pending",
            "progress": 0
        }
    elif task.state == "PROGRESS" or task.state == "STARTED":
        response = {
            "task_id": task_id,
            "status": "running",
            "progress": task.info.get("current", 0) if task.info else 0,
            "total": task.info.get("total", 100) if task.info else 100
        }
    elif task.state == "SUCCESS":
        response = {
            "task_id": task_id,
            "status": "completed",
            "progress": 100,
            "result": task.result
        }
    elif task.state == "FAILURE":
        response = {
            "task_id": task_id,
            "status": "failed",
            "error": str(task.info)
        }
    else:
        # Unknown state
        response = {
            "task_id": task_id,
            "status": task.state.lower(),
            "info": str(task.info) if task.info else None
        }
    
    return response


@router.delete("/task/{task_id}")
def cancel_task(task_id: str):
    """Cancel a running task."""
    from tasks.celery_app import celery_app
    
    # Revoke the task
    celery_app.control.revoke(task_id, terminate=True, signal='SIGTERM')
    
    return {
        "message": "Task cancellation requested",
        "task_id": task_id
    }
