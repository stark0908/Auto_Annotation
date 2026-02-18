"""
Active learning routes - select samples for annotation.
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import List
from db.database import get_db
from db import crud
from db.models import ImageStatus
from core.embedding_generator import FAISSVectorStore
from core.active_learning import ActiveLearningSelector


router = APIRouter(prefix="/active-learning", tags=["active-learning"])


@router.get("/{project_id}/next-batch")
def get_next_batch(
    project_id: str,
    batch_size: int = Query(10, ge=1, le=50),
    strategy: str = Query("max_distance", regex="^(max_distance|kmeans|random)$"),
    db: Session = Depends(get_db)
):
    """
    Get next batch of images to annotate using active learning.
    """
    # Check project exists
    project = crud.get_project(db, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    try:
        # Load embeddings from FAISS
        vector_store = FAISSVectorStore(project_id)
        
        if vector_store.index.ntotal == 0:
            raise HTTPException(
                status_code=400, 
                detail="No embeddings found. Please generate embeddings first."
            )
        
        # Get all image IDs from FAISS
        all_image_ids = vector_store.image_ids
        all_embeddings = vector_store.get_all_embeddings()
        
        # Get annotated image IDs
        annotated_images = crud.get_project_images(db, project_id, status=ImageStatus.ANNOTATED)
        annotated_ids = set(img.id for img in annotated_images)
        
        # Select next batch
        selector = ActiveLearningSelector()
        selected_ids = selector.select_diverse_samples(
            all_embeddings=all_embeddings,
            all_image_ids=all_image_ids,
            annotated_image_ids=annotated_ids,
            batch_size=batch_size,
            strategy=strategy
        )
        
        # Update selected images status
        for img_id in selected_ids:
            crud.update_image_status(db, img_id, ImageStatus.SELECTED)
        
        # Get image details
        selected_images = [crud.get_image(db, img_id) for img_id in selected_ids]
        
        return {
            "selected": len(selected_ids),
            "strategy": strategy,
            "images": [
                {
                    "id": img.id,
                    "filename": img.filename,
                    "file_path": img.file_path,
                    "width": img.width,
                    "height": img.height
                }
                for img in selected_images if img
            ]
        }
    
    except FileNotFoundError:
        raise HTTPException(
            status_code=400, 
            detail="Embeddings not found. Please generate embeddings first."
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
