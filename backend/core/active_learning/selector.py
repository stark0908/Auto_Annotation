"""
Active learning module.
Intelligently selects images for annotation based on embeddings.
"""
import numpy as np
from typing import List, Set
from sklearn.cluster import KMeans


class ActiveLearningSelector:
    """
    Active learning selector using diversity sampling.
    Selects images that are most different from already annotated ones.
    """
    
    def __init__(self):
        pass
    
    def select_diverse_samples(
        self, 
        all_embeddings: np.ndarray,
        all_image_ids: List[str],
        annotated_image_ids: Set[str],
        batch_size: int = 10,
        strategy: str = "max_distance"
    ) -> List[str]:
        """
        Select diverse samples for annotation.
        
        Args:
            all_embeddings: All image embeddings (N x D)
            all_image_ids: All image IDs
            annotated_image_ids: Set of already annotated image IDs
            batch_size: Number of samples to select
            strategy: "max_distance", "kmeans", or "random"
        
        Returns:
            List of selected image IDs
        """
        # Filter out already annotated images
        unannotated_indices = [
            i for i, img_id in enumerate(all_image_ids) 
            if img_id not in annotated_image_ids
        ]
        
        if len(unannotated_indices) == 0:
            return []
        
        if len(unannotated_indices) <= batch_size:
            # Return all remaining images
            return [all_image_ids[i] for i in unannotated_indices]
        
        unannotated_embeddings = all_embeddings[unannotated_indices]
        unannotated_ids = [all_image_ids[i] for i in unannotated_indices]
        
        # Apply selection strategy
        if strategy == "random":
            selected = self._random_selection(unannotated_ids, batch_size)
        
        elif strategy == "kmeans":
            selected = self._kmeans_selection(
                unannotated_embeddings, 
                unannotated_ids, 
                batch_size
            )
        
        else:  # max_distance (default)
            annotated_indices = [
                i for i, img_id in enumerate(all_image_ids) 
                if img_id in annotated_image_ids
            ]
            
            if len(annotated_indices) == 0:
                # First batch - use k-means
                selected = self._kmeans_selection(
                    unannotated_embeddings, 
                    unannotated_ids, 
                    batch_size
                )
            else:
                annotated_embeddings = all_embeddings[annotated_indices]
                selected = self._max_distance_selection(
                    unannotated_embeddings,
                    unannotated_ids,
                    annotated_embeddings,
                    batch_size
                )
        
        return selected
    
    def _random_selection(self, image_ids: List[str], k: int) -> List[str]:
        """Random selection (baseline)."""
        indices = np.random.choice(len(image_ids), size=k, replace=False)
        return [image_ids[i] for i in indices]
    
    def _kmeans_selection(
        self, 
        embeddings: np.ndarray, 
        image_ids: List[str], 
        k: int
    ) -> List[str]:
        """
        K-means clustering and select samples closest to cluster centers.
        Good for initial batch when nothing is annotated yet.
        """
        # Run k-means
        kmeans = KMeans(n_clusters=k, random_state=42, n_init=10)
        kmeans.fit(embeddings)
        
        # Find samples closest to each cluster center
        selected_indices = []
        for center in kmeans.cluster_centers_:
            # Compute distances to this center
            distances = np.linalg.norm(embeddings - center, axis=1)
            # Find closest sample not already selected
            for idx in np.argsort(distances):
                if idx not in selected_indices:
                    selected_indices.append(idx)
                    break
        
        return [image_ids[i] for i in selected_indices]
    
    def _max_distance_selection(
        self,
        unannotated_embeddings: np.ndarray,
        unannotated_ids: List[str],
        annotated_embeddings: np.ndarray,
        k: int
    ) -> List[str]:
        """
        Select samples that are farthest from annotated set.
        Maximizes diversity by choosing dissimilar examples.
        """
        selected_indices = []
        
        for _ in range(k):
            if len(selected_indices) == len(unannotated_ids):
                break
            
            # For each unannotated sample, compute min distance to annotated set
            max_min_dist = -1
            best_idx = None
            
            for i in range(len(unannotated_embeddings)):
                if i in selected_indices:
                    continue
                
                # Distance to all annotated samples
                distances = np.linalg.norm(
                    annotated_embeddings - unannotated_embeddings[i], 
                    axis=1
                )
                
                # Minimum distance to annotated set
                min_dist = np.min(distances)
                
                # Keep track of sample with maximum minimum distance
                if min_dist > max_min_dist:
                    max_min_dist = min_dist
                    best_idx = i
            
            if best_idx is not None:
                selected_indices.append(best_idx)
                
                # Add this to annotated set for next iteration
                annotated_embeddings = np.vstack([
                    annotated_embeddings, 
                    unannotated_embeddings[best_idx:best_idx+1]
                ])
        
        return [unannotated_ids[i] for i in selected_indices]
