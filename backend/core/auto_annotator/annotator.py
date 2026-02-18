"""
Auto-annotator module.
Runs inference to automatically annotate images.
"""
from ultralytics import YOLO
from typing import List, Dict
from pathlib import Path


class AutoAnnotator:
    """
    Auto-annotate images using trained YOLO model.
    """
    
    def __init__(self, model_path: str):
        """Load trained model."""
        print(f"📦 Loading model from {model_path}...")
        self.model = YOLO(model_path)
        print(f"✅ Model loaded!")
    
    def annotate_image(
        self, 
        image_path: str, 
        confidence_threshold: float = 0.25,
        iou_threshold: float = 0.45
    ) -> List[Dict]:
        """
        Annotate a single image.
        Returns: list of annotations with format:
            {
                "class_id": int,
                "bbox": {"x": float, "y": float, "w": float, "h": float},
                "confidence": float
            }
        """
        # Run inference
        results = self.model.predict(
            source=image_path,
            conf=confidence_threshold,
            iou=iou_threshold,
            verbose=False
        )
        
        annotations = []
        
        # Process results
        result = results[0]  # First (and only) result
        boxes = result.boxes
        
        for box in boxes:
            # Get box in xyxy format
            xyxy = box.xyxy[0].cpu().numpy()
            
            # Convert to YOLO format (normalized center x, y, width, height)
            img_width = result.orig_shape[1]
            img_height = result.orig_shape[0]
            
            x_center = ((xyxy[0] + xyxy[2]) / 2) / img_width
            y_center = ((xyxy[1] + xyxy[3]) / 2) / img_height
            width = (xyxy[2] - xyxy[0]) / img_width
            height = (xyxy[3] - xyxy[1]) / img_height
            
            annotations.append({
                "class_id": int(box.cls[0]),
                "bbox": {
                    "x": float(x_center),
                    "y": float(y_center),
                    "w": float(width),
                    "h": float(height)
                },
                "confidence": float(box.conf[0])
            })
        
        return annotations
    
    def annotate_batch(
        self,
        image_paths: List[str],
        confidence_threshold: float = 0.25,
        iou_threshold: float = 0.45
    ) -> Dict[str, List[Dict]]:
        """
        Annotate multiple images.
        Returns: dict mapping image_path to list of annotations
        """
        print(f"🔍 Auto-annotating {len(image_paths)} images...")
        
        all_annotations = {}
        
        for i, image_path in enumerate(image_paths):
            annotations = self.annotate_image(
                image_path, 
                confidence_threshold, 
                iou_threshold
            )
            all_annotations[image_path] = annotations
            
            if (i + 1) % 10 == 0:
                print(f"   Processed {i + 1}/{len(image_paths)} images")
        
        print(f"✅ Auto-annotation completed!")
        return all_annotations
