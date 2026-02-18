"""
Training module for few-shot object detection.
Uses YOLOv8 with transfer learning.
"""
import os
from pathlib import Path
from ultralytics import YOLO
from typing import List, Dict
import yaml
from config import settings


class FewShotTrainer:
    """
    Simple trainer for YOLOv8 using few-shot learning approach.
    """
    
    def __init__(self, project_id: str):
        self.project_id = project_id
        self.project_dir = Path(settings.DATA_DIR) / "projects" / project_id
        self.models_dir = self.project_dir / "models"
        self.models_dir.mkdir(parents=True, exist_ok=True)
    
    def prepare_yolo_dataset(
        self, 
        images: List[Dict], 
        annotations: List[Dict],
        classes: List[Dict]
    ) -> str:
        """
        Prepare dataset in YOLO format.
        Returns: path to data.yaml
        """
        # Create YOLO directory structure
        yolo_dir = self.project_dir / "yolo_dataset"
        train_images = yolo_dir / "images" / "train"
        train_labels = yolo_dir / "labels" / "train"
        
        train_images.mkdir(parents=True, exist_ok=True)
        train_labels.mkdir(parents=True, exist_ok=True)
        
        # Create symlinks to images (to avoid copying)
        for img in images:
            src = Path(img["file_path"])
            # Handle path mismatches: stored path might not match current DATA_DIR
            if not src.exists():
                # Try reconstructing from DATA_DIR + relative path
                # Extract the relative portion (projects/xxx/images/filename)
                parts = str(src).replace('\\', '/')
                if 'projects/' in parts:
                    rel = parts[parts.index('projects/'):]
                    src = Path(settings.DATA_DIR) / rel
            dst = train_images / img["filename"]
            if not dst.exists():
                try:
                    if src.exists():
                        os.symlink(src.resolve(), dst)
                    else:
                        print(f"Warning: source image not found: {src}")
                except Exception:
                    import shutil
                    if src.exists():
                        shutil.copy2(src, dst)
        
        # Write label files (YOLO format: class_id center_x center_y width height)
        # Group annotations by image
        img_annotations = {}
        for ann in annotations:
            img_id = ann["image_id"]
            if img_id not in img_annotations:
                img_annotations[img_id] = []
            img_annotations[img_id].append(ann)
        
        # Create class_id mapping
        class_map = {cls["id"]: idx for idx, cls in enumerate(classes)}
        
        # Write label files
        for img in images:
            img_id = img["id"]
            label_file = train_labels / f"{Path(img['filename']).stem}.txt"
            
            with open(label_file, "w") as f:
                if img_id in img_annotations:
                    for ann in img_annotations[img_id]:
                        bbox = ann["bbox"]
                        class_idx = class_map[ann["class_id"]]
                        # YOLO format
                        f.write(f"{class_idx} {bbox['x']} {bbox['y']} {bbox['w']} {bbox['h']}\n")
        
        # Create data.yaml
        data_yaml = {
            "path": str(yolo_dir.absolute()),
            "train": "images/train",
            "val": "images/train",  # Using same for now (small dataset)
            "names": {idx: cls["name"] for idx, cls in enumerate(classes)}
        }
        
        data_yaml_path = yolo_dir / "data.yaml"
        with open(data_yaml_path, "w") as f:
            yaml.dump(data_yaml, f)
        
        print(f"Prepared YOLO dataset at {yolo_dir}")
        return str(data_yaml_path)
    
    def train(
        self,
        data_yaml_path: str,
        epochs: int = 50,
        batch_size: int = 16,
        img_size: int = 640,
        model_name: str = "yolov8n.pt"
    ) -> str:
        """
        Train YOLOv8 model.
        Captures all output to a log file for frontend streaming.
        Returns: path to best model weights
        """
        import sys
        
        log_file_path = self.project_dir / "training.log"
        
        # TeeWriter: writes to both original stream and log file
        class TeeWriter:
            def __init__(self, original, log_fh):
                self.original = original
                self.log_fh = log_fh
            def write(self, text):
                self.original.write(text)
                self.original.flush()
                self.log_fh.write(text)
                self.log_fh.flush()
            def flush(self):
                self.original.flush()
                self.log_fh.flush()
        
        log_fh = open(log_file_path, "w")
        old_stdout = sys.stdout
        old_stderr = sys.stderr
        sys.stdout = TeeWriter(old_stdout, log_fh)
        sys.stderr = TeeWriter(old_stderr, log_fh)
        
        try:
            print(f"Starting training...")
            print(f"   Model: {model_name}")
            print(f"   Epochs: {epochs}")
            print(f"   Batch size: {batch_size}")
            print(f"   Log file: {log_file_path}")
            
            # Load pretrained model
            model = YOLO(model_name)
            
            # Train
            results = model.train(
                data=data_yaml_path,
                epochs=epochs,
                batch=batch_size,
                imgsz=img_size,
                project=str(self.models_dir),
                name="train",
                exist_ok=True,
                patience=20,
                # Disable RAM-heavy augmentations (each loads extra images per batch)
                mosaic=0.0,
                mixup=0.0,
                copy_paste=0.0,
                lr0=0.001,
                lrf=0.01,
                verbose=True,
                workers=1
            )
            
            # Best model path
            best_model_path = self.models_dir / "train" / "weights" / "best.pt"
            
            print(f"Training completed!")
            print(f"   Best model: {best_model_path}")
            
            return str(best_model_path)
        
        finally:
            sys.stdout = old_stdout
            sys.stderr = old_stderr
            log_fh.close()
    
    def get_latest_model(self) -> str:
        """Get path to the most recently trained model."""
        best_model = self.models_dir / "train" / "weights" / "best.pt"
        if best_model.exists():
            return str(best_model)
        return None
    
    def get_log_file(self) -> str:
        """Get path to the training log file."""
        return str(self.project_dir / "training.log")
