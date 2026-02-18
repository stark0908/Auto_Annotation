"""
Export module.
Export annotations in different formats (YOLO, COCO, VOC).
"""
import json
import yaml
from pathlib import Path
from typing import List, Dict
import shutil


class AnnotationExporter:
    """Export annotations in various formats."""
    
    def __init__(self, project_id: str, project_dir: str):
        self.project_id = project_id
        self.project_dir = Path(project_dir)
        self.export_dir = self.project_dir / "exports"
        self.export_dir.mkdir(parents=True, exist_ok=True)
    
    def export_yolo(
        self,
        images: List[Dict],
        annotations: List[Dict],
        classes: List[Dict],
        output_name: str = "yolo_export"
    ) -> str:
        """
        Export in YOLO format.
        Returns: path to exported zip file
        """
        export_path = self.export_dir / output_name
        images_dir = export_path / "images"
        labels_dir = export_path / "labels"
        
        images_dir.mkdir(parents=True, exist_ok=True)
        labels_dir.mkdir(parents=True, exist_ok=True)
        
        # Create class mapping
        class_map = {cls["id"]: idx for idx, cls in enumerate(classes)}
        
        # Group annotations by image
        img_annotations = {}
        for ann in annotations:
            img_id = ann["image_id"]
            if img_id not in img_annotations:
                img_annotations[img_id] = []
            img_annotations[img_id].append(ann)
        
        # Copy images and create label files
        for img in images:
            # Copy image
            src = Path(img["file_path"])
            dst = images_dir / img["filename"]
            shutil.copy2(src, dst)
            
            # Create label file
            label_file = labels_dir / f"{Path(img['filename']).stem}.txt"
            with open(label_file, "w") as f:
                if img["id"] in img_annotations:
                    for ann in img_annotations[img["id"]]:
                        bbox = ann["bbox"]
                        class_idx = class_map[ann["class_id"]]
                        f.write(f"{class_idx} {bbox['x']} {bbox['y']} {bbox['w']} {bbox['h']}\n")
        
        # Create data.yaml
        data_yaml = {
            "names": [cls["name"] for cls in classes]
        }
        with open(export_path / "data.yaml", "w") as f:
            yaml.dump(data_yaml, f)
        
        # Create classes.txt for reference
        with open(export_path / "classes.txt", "w") as f:
            for cls in classes:
                f.write(f"{cls['name']}\n")
        
        print(f"✅ Exported YOLO format to {export_path}")
        return str(export_path)
    
    def export_coco(
        self,
        images: List[Dict],
        annotations: List[Dict],
        classes: List[Dict],
        output_name: str = "coco_export.json"
    ) -> str:
        """
        Export in COCO format.
        Returns: path to exported JSON file
        """
        coco_data = {
            "images": [],
            "annotations": [],
            "categories": []
        }
        
        # Categories (classes)
        class_map = {}
        for idx, cls in enumerate(classes):
            class_map[cls["id"]] = idx + 1  # COCO uses 1-indexed
            coco_data["categories"].append({
                "id": idx + 1,
                "name": cls["name"],
                "supercategory": "object"
            })
        
        # Images
        image_map = {}
        for idx, img in enumerate(images):
            img_id = idx + 1
            image_map[img["id"]] = img_id
            coco_data["images"].append({
                "id": img_id,
                "file_name": img["filename"],
                "width": img["width"],
                "height": img["height"]
            })
        
        # Annotations
        for idx, ann in enumerate(annotations):
            bbox = ann["bbox"]
            
            # Convert from YOLO (center x, y, w, h) to COCO (top-left x, y, w, h)
            img = next(i for i in images if i["id"] == ann["image_id"])
            img_width = img["width"]
            img_height = img["height"]
            
            x_center = bbox["x"] * img_width
            y_center = bbox["y"] * img_height
            width = bbox["w"] * img_width
            height = bbox["h"] * img_height
            
            x_min = x_center - width / 2
            y_min = y_center - height / 2
            
            coco_data["annotations"].append({
                "id": idx + 1,
                "image_id": image_map[ann["image_id"]],
                "category_id": class_map[ann["class_id"]],
                "bbox": [x_min, y_min, width, height],
                "area": width * height,
                "iscrowd": 0
            })
        
        # Save JSON
        output_path = self.export_dir / output_name
        with open(output_path, "w") as f:
            json.dump(coco_data, f, indent=2)
        
        print(f"✅ Exported COCO format to {output_path}")
        return str(output_path)
