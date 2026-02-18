"""
Dataset processor module.
Handles image upload, validation, and storage.
"""
import os
import shutil
from pathlib import Path
from PIL import Image
from typing import List, Tuple
from config import settings


class DatasetProcessor:
    """Simple dataset processor - validate and save images."""
    
    def __init__(self, project_id: str):
        self.project_id = project_id
        self.project_dir = Path(settings.DATA_DIR) / "projects" / project_id
        self.images_dir = self.project_dir / "images"
        
        # Create directories
        self.images_dir.mkdir(parents=True, exist_ok=True)
    
    def validate_image(self, file_path: str) -> Tuple[bool, str]:
        """
        Validate if file is a valid image.
        Returns: (is_valid, error_message)
        """
        try:
            with Image.open(file_path) as img:
                # Check if it's a valid image
                img.verify()
                return True, ""
        except Exception as e:
            return False, str(e)
    
    def get_image_dimensions(self, file_path: str) -> Tuple[int, int]:
        """Get image width and height."""
        with Image.open(file_path) as img:
            return img.size  # Returns (width, height)
    
    def save_image(self, source_path: str, filename: str) -> str:
        """
        Save image to project directory.
        Returns: path to saved image
        """
        # Clean filename
        clean_filename = self._clean_filename(filename)
        dest_path = self.images_dir / clean_filename
        
        # Copy file
        shutil.copy2(source_path, dest_path)
        
        return str(dest_path)
    
    def _clean_filename(self, filename: str) -> str:
        """Clean filename to avoid issues."""
        # Remove any path components
        filename = os.path.basename(filename)
        # Replace spaces with underscores
        filename = filename.replace(" ", "_")
        return filename
    
    def process_uploaded_file(self, file_path: str, original_filename: str) -> dict:
        """
        Process an uploaded file: validate, get dimensions, save.
        Returns: dict with file info or error
        """
        # Validate
        is_valid, error = self.validate_image(file_path)
        if not is_valid:
            return {"success": False, "error": f"Invalid image: {error}"}
        
        # Get dimensions
        width, height = self.get_image_dimensions(file_path)
        
        # Save
        saved_path = self.save_image(file_path, original_filename)
        
        return {
            "success": True,
            "filename": os.path.basename(saved_path),
            "file_path": saved_path,
            "width": width,
            "height": height
        }
    
    def get_image_path(self, filename: str) -> str:
        """Get full path to an image."""
        return str(self.images_dir / filename)
