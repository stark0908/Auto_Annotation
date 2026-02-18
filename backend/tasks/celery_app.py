"""
Celery tasks for background processing.
Handles long-running tasks like embedding generation, training, and auto-annotation.
"""
from celery import Celery
from config import settings
from db.database import get_db_session
from db import crud
from db.models import ProjectStatus, ImageStatus
from core.embedding_generator import EmbeddingGenerator, FAISSVectorStore
from core.training import FewShotTrainer
from core.auto_annotator import AutoAnnotator
from pathlib import Path


def resolve_image_path(file_path: str) -> str:
    """Resolve image path, handling mismatches between stored and actual paths."""
    p = Path(file_path)
    if p.exists():
        return str(p)
    # Reconstruct from DATA_DIR
    parts = str(p).replace('\\', '/')
    if 'projects/' in parts:
        rel = parts[parts.index('projects/'):]
        resolved = Path(settings.DATA_DIR) / rel
        if resolved.exists():
            return str(resolved)
    return file_path

# Initialize Celery
celery_app = Celery(
    "auto_annotation",
    broker=settings.CELERY_BROKER_URL,
    backend=settings.CELERY_RESULT_BACKEND
)

celery_app.conf.update(
    task_serializer='json',
    accept_content=['json'],
    result_serializer='json',
    timezone='UTC',
    enable_utc=True,
)


@celery_app.task(bind=True)
def generate_embeddings_task(self, project_id: str, model_name: str = "openai/clip-vit-base-patch32"):
    """
    Background task to generate embeddings for all images in a project.
    """
    try:
        # Update project status
        with get_db_session() as db:
            crud.update_project_status(db, project_id, ProjectStatus.EMBEDDING)
            
            # Get all images
            images = crud.get_project_images(db, project_id)
            
            if not images:
                return {"status": "error", "message": "No images found"}
            
            # Initialize generator
            generator = EmbeddingGenerator(model_name)
            vector_store = FAISSVectorStore(project_id, generator.embedding_dim)
            
            # Generate embeddings
            image_paths = [resolve_image_path(img.file_path) for img in images]
            image_ids = [img.id for img in images]
            
            print(f"Generating embeddings for {len(images)} images...")
            embeddings = generator.generate_batch_embeddings(image_paths, batch_size=32)
            
            # Add to FAISS
            vector_store.add_embeddings(embeddings, image_ids)
            vector_store.save_index()
            
            # Create embedding records in DB
            for img_id in image_ids:
                crud.create_embedding_record(db, img_id, model_name)
            
            # Update project status
            crud.update_project_status(db, project_id, ProjectStatus.ANNOTATING)
            
            return {
                "status": "success",
                "message": f"Generated {len(embeddings)} embeddings",
                "num_embeddings": len(embeddings)
            }
    
    except Exception as e:
        print(f"Error generating embeddings: {e}")
        return {"status": "error", "message": str(e)}


@celery_app.task(bind=True)
def train_model_task(self, project_id: str, epochs: int = 50, batch_size: int = 16):
    """
    Background task to train object detection model.
    """
    try:
        with get_db_session() as db:
            # Update project status
            crud.update_project_status(db, project_id, ProjectStatus.TRAINING)
            
            # Get annotated images
            images = crud.get_project_images(db, project_id, status=ImageStatus.ANNOTATED)
            
            if len(images) < 5:
                return {"status": "error", "message": "Need at least 5 annotated images to train"}
            
            # Get annotations
            all_annotations = []
            for img in images:
                anns = crud.get_image_annotations(db, img.id)
                for ann in anns:
                    all_annotations.append({
                        "image_id": ann.image_id,
                        "class_id": ann.class_id,
                        "bbox": ann.bbox
                    })
            
            # Get classes
            classes = crud.get_project_classes(db, project_id)
            
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
            
            # Train
            trainer = FewShotTrainer(project_id)
            data_yaml = trainer.prepare_yolo_dataset(images_dict, all_annotations, classes_dict)
            model_path = trainer.train(
                data_yaml,
                epochs=epochs,
                batch_size=batch_size
            )
            
            # Update project status
            crud.update_project_status(db, project_id, ProjectStatus.ANNOTATING)
            
            return {
                "status": "success",
                "message": "Training completed",
                "model_path": model_path,
                "num_images": len(images)
            }
    
    except Exception as e:
        print(f"Error training model: {e}")
        return {"status": "error", "message": str(e)}


@celery_app.task(bind=True)
def auto_annotate_task(self, project_id: str, confidence_threshold: float = 0.25):
    """
    Background task to auto-annotate remaining images.
    """
    try:
        with get_db_session() as db:
            # Update project status
            crud.update_project_status(db, project_id, ProjectStatus.AUTO_ANNOTATING)
            
            # Get trained model
            trainer = FewShotTrainer(project_id)
            model_path = trainer.get_latest_model()
            
            if not model_path:
                return {"status": "error", "message": "No trained model found"}
            
            # Get unannotated images
            images = crud.get_project_images(db, project_id, status=ImageStatus.UNANNOTATED)
            
            if not images:
                return {"status": "success", "message": "No images to annotate"}
            
            # Auto-annotate
            annotator = AutoAnnotator(model_path)
            # Build resolved path mapping
            resolved_paths = {img.id: resolve_image_path(img.file_path) for img in images}
            image_paths = list(resolved_paths.values())
            
            results = annotator.annotate_batch(image_paths, confidence_threshold)
            
            # Get class mapping (model class idx to DB class id)
            classes = crud.get_project_classes(db, project_id)
            class_idx_to_id = {idx: cls.id for idx, cls in enumerate(classes)}
            
            # Save annotations
            total_annotations = 0
            for img in images:
                resolved = resolved_paths[img.id]
                annotations = results.get(resolved, [])
                
                for ann in annotations:
                    # Map model class idx to DB class id
                    model_class_idx = ann["class_id"]
                    if model_class_idx < len(classes):
                        class_id = class_idx_to_id[model_class_idx]
                        
                        crud.create_annotation(
                            db,
                            image_id=img.id,
                            class_id=class_id,
                            bbox=ann["bbox"],
                            confidence=ann["confidence"],
                            source="auto"
                        )
                        total_annotations += 1
                
                # Update image status
                crud.update_image_status(db, img.id, ImageStatus.AUTO_ANNOTATED)
            
            # Update project status
            crud.update_project_status(db, project_id, ProjectStatus.COMPLETED)
            
            return {
                "status": "success",
                "message": f"Auto-annotated {len(images)} images",
                "num_images": len(images),
                "total_annotations": total_annotations
            }
    
    except Exception as e:
        print(f"Error auto-annotating: {e}")
        return {"status": "error", "message": str(e)}
