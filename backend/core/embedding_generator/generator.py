"""
Embedding generator module.
Extracts feature embeddings from images using pretrained models.
"""
import torch
import numpy as np
from PIL import Image
from pathlib import Path
from typing import List, Tuple
import faiss
from transformers import CLIPProcessor, CLIPModel
from config import settings


class EmbeddingGenerator:
    """Generate embeddings using CLIP model (simple and effective)."""
    
    def __init__(self, model_name: str = "openai/clip-vit-base-patch32"):
        """
        Initialize embedding generator.
        Using CLIP by default - works great for general images.
        """
        self.device = "cuda" if torch.cuda.is_available() else "cpu"
        print(f"🔧 Loading {model_name} on {self.device}...")
        
        # Load CLIP model
        self.model = CLIPModel.from_pretrained(model_name).to(self.device)
        self.processor = CLIPProcessor.from_pretrained(model_name)
        self.model.eval()  # Set to evaluation mode
        
        self.embedding_dim = 512  # CLIP ViT-Base outputs 512-dim vectors
        
        print(f"✅ Model loaded! Embedding dimension: {self.embedding_dim}")
    
    def generate_embedding(self, image_path: str) -> np.ndarray:
        """
        Generate embedding for a single image.
        Returns: numpy array of shape (embedding_dim,)
        """
        # Load image
        image = Image.open(image_path).convert("RGB")
        
        # Process image
        inputs = self.processor(images=image, return_tensors="pt")
        inputs = {k: v.to(self.device) for k, v in inputs.items()}
        
        # Generate embedding
        with torch.no_grad():
            outputs = self.model.get_image_features(**inputs)
            embedding = outputs.cpu().numpy()[0]
        
        # Normalize (good practice for similarity search)
        embedding = embedding / np.linalg.norm(embedding)
        
        return embedding
    
    def generate_batch_embeddings(self, image_paths: List[str], batch_size: int = 32) -> np.ndarray:
        """
        Generate embeddings for multiple images in batches.
        Returns: numpy array of shape (num_images, embedding_dim)
        """
        embeddings = []
        
        for i in range(0, len(image_paths), batch_size):
            batch_paths = image_paths[i:i + batch_size]
            
            # Load batch of images
            images = [Image.open(path).convert("RGB") for path in batch_paths]
            
            # Process batch
            inputs = self.processor(images=images, return_tensors="pt", padding=True)
            inputs = {k: v.to(self.device) for k, v in inputs.items()}
            
            # Generate embeddings
            with torch.no_grad():
                outputs = self.model.get_image_features(**inputs)
                batch_embeddings = outputs.cpu().numpy()
            
            # Normalize
            batch_embeddings = batch_embeddings / np.linalg.norm(batch_embeddings, axis=1, keepdims=True)
            
            embeddings.append(batch_embeddings)
            
            print(f"  Processed {min(i + batch_size, len(image_paths))}/{len(image_paths)} images")
        
        return np.vstack(embeddings)


class FAISSVectorStore:
    """Simple FAISS vector store for similarity search."""
    
    def __init__(self, project_id: str, embedding_dim: int = 512):
        self.project_id = project_id
        self.embedding_dim = embedding_dim
        
        # FAISS index directory
        self.index_dir = Path(settings.DATA_DIR) / "projects" / project_id / "embeddings"
        self.index_dir.mkdir(parents=True, exist_ok=True)
        self.index_path = self.index_dir / "faiss.index"
        self.mapping_path = self.index_dir / "id_mapping.npy"
        
        # Create or load index
        if self.index_path.exists():
            self.load_index()
        else:
            self.create_index()
    
    def create_index(self):
        """Create a new FAISS index (simple flat L2 index)."""
        # Using IndexFlatL2 - simple and accurate
        # For larger datasets, could use IndexIVFFlat for speed
        self.index = faiss.IndexFlatL2(self.embedding_dim)
        self.image_ids = []  # Map FAISS index to image IDs
        print(f"✅ Created new FAISS index (dim={self.embedding_dim})")
    
    def add_embeddings(self, embeddings: np.ndarray, image_ids: List[str]):
        """Add embeddings to the index."""
        # Ensure float32 (FAISS requirement)
        embeddings = embeddings.astype(np.float32)
        
        # Add to index
        self.index.add(embeddings)
        self.image_ids.extend(image_ids)
        
        print(f"✅ Added {len(image_ids)} embeddings to index")
    
    def save_index(self):
        """Save index and ID mapping to disk."""
        faiss.write_index(self.index, str(self.index_path))
        np.save(self.mapping_path, np.array(self.image_ids))
        print(f"💾 Saved index to {self.index_path}")
    
    def load_index(self):
        """Load index and ID mapping from disk."""
        self.index = faiss.read_index(str(self.index_path))
        self.image_ids = list(np.load(self.mapping_path, allow_pickle=True))
        print(f"📂 Loaded index with {len(self.image_ids)} embeddings")
    
    def search_similar(self, query_embedding: np.ndarray, k: int = 10) -> List[Tuple[str, float]]:
        """
        Search for similar embeddings.
        Returns: list of (image_id, distance) tuples
        """
        query_embedding = query_embedding.reshape(1, -1).astype(np.float32)
        distances, indices = self.index.search(query_embedding, k)
        
        results = []
        for dist, idx in zip(distances[0], indices[0]):
            if idx < len(self.image_ids):
                results.append((self.image_ids[idx], float(dist)))
        
        return results
    
    def get_all_embeddings(self) -> np.ndarray:
        """Get all embeddings from the index."""
        if self.index.ntotal == 0:
            return np.array([])
        
        # Reconstruct all vectors from index
        embeddings = np.zeros((self.index.ntotal, self.embedding_dim), dtype=np.float32)
        for i in range(self.index.ntotal):
            embeddings[i] = self.index.reconstruct(i)
        
        return embeddings
