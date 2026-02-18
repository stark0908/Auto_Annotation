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


@router.get("/{project_id}/logs")
def get_training_logs(
    project_id: str,
    last_epoch: int = 0
):
    """Get parsed training metrics from YOLOv8 results.csv."""
    from config import settings
    from pathlib import Path
    import csv
    
    project_dir = Path(settings.DATA_DIR) / "projects" / project_id
    results_path = project_dir / "models" / "train" / "results.csv"
    log_path = project_dir / "training.log"
    
    # Get status message from training.log (first few lines only)
    status_msg = ""
    if log_path.exists():
        with open(log_path, "r", errors="replace") as f:
            lines = f.readlines()
            # Get only non-progress-bar lines (lines that don't contain progress indicators)
            status_lines = []
            for line in lines[:10]:
                clean = line.strip()
                if clean and '|' not in clean and '%|' not in clean and 'it/s' not in clean:
                    status_lines.append(clean)
            status_msg = '\n'.join(status_lines)
    
    # Parse results.csv for epoch metrics
    epochs = []
    if results_path.exists():
        with open(results_path, "r") as f:
            reader = csv.reader(f)
            header = next(reader, None)
            if header:
                # Clean header whitespace
                header = [h.strip() for h in header]
                for row in reader:
                    if not row or not row[0].strip():
                        continue
                    vals = [v.strip() for v in row]
                    try:
                        epoch_data = {
                            "epoch": int(float(vals[0])),
                            "box_loss": round(float(vals[1]), 4),
                            "cls_loss": round(float(vals[2]), 4),
                            "dfl_loss": round(float(vals[3]), 4),
                            "precision": round(float(vals[4]), 4),
                            "recall": round(float(vals[5]), 4),
                            "mAP50": round(float(vals[6]), 4),
                            "mAP50_95": round(float(vals[7]), 4),
                            "val_box_loss": round(float(vals[8]), 4),
                            "val_cls_loss": round(float(vals[9]), 4),
                            "val_dfl_loss": round(float(vals[10]), 4),
                        }
                        epochs.append(epoch_data)
                    except (IndexError, ValueError):
                        continue
    
    # Only return new epochs
    new_epochs = [e for e in epochs if e["epoch"] > last_epoch]
    
    return {
        "status": status_msg,
        "epochs": new_epochs,
        "total_epochs": len(epochs),
        "training": log_path.exists()
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
