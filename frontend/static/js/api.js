/**
 * API Client — all backend API calls.
 * Uses fetch, returns parsed JSON.
 */
const API = {
    BASE: '/api',

    // Helper for fetch
    async _fetch(url, options = {}) {
        try {
            const res = await fetch(this.BASE + url, options);
            if (!res.ok) {
                const err = await res.json().catch(() => ({ detail: res.statusText }));
                throw new Error(err.detail || `HTTP ${res.status}`);
            }
            return await res.json();
        } catch (e) {
            console.error(`API Error: ${url}`, e);
            throw e;
        }
    },

    // ---- Projects ----
    listProjects() {
        return this._fetch('/projects/');
    },
    createProject(name, description) {
        return this._fetch('/projects/', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, description })
        });
    },
    getProject(id) {
        return this._fetch(`/projects/${id}`);
    },

    // ---- Images ----
    async uploadImages(projectId, files) {
        const formData = new FormData();
        for (const f of files) formData.append('files', f);
        const res = await fetch(`${this.BASE}/images/${projectId}/upload`, {
            method: 'POST',
            body: formData
        });
        if (!res.ok) throw new Error('Upload failed');
        return res.json();
    },
    listImages(projectId, status = null) {
        const params = status ? `?status=${status}` : '';
        return this._fetch(`/images/${projectId}${params}`);
    },
    generateEmbeddings(projectId) {
        return this._fetch(`/images/${projectId}/generate-embeddings`, { method: 'POST' });
    },
    getImageUrl(imageId) {
        return `${this.BASE}/serve/image/${imageId}`;
    },
    getEmbeddingStats(projectId) {
        return this._fetch(`/images/${projectId}/embedding-stats`);
    },

    // ---- Active Learning ----
    getNextBatch(projectId, batchSize = 10, strategy = 'max_distance') {
        return this._fetch(`/active-learning/${projectId}/next-batch?batch_size=${batchSize}&strategy=${strategy}`);
    },

    // ---- Classes ----
    listClasses(projectId) {
        return this._fetch(`/annotations/${projectId}/classes`);
    },
    createClass(projectId, name, color) {
        return this._fetch(`/annotations/${projectId}/classes`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, color })
        });
    },
    deleteClass(projectId, classId) {
        return this._fetch(`/annotations/${projectId}/classes/${classId}`, { method: 'DELETE' });
    },

    // ---- Annotations ----
    createAnnotation(imageId, classId, bbox, source = 'manual') {
        return this._fetch('/annotations/', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ image_id: imageId, class_id: classId, bbox, source })
        });
    },
    getImageAnnotations(imageId) {
        return this._fetch(`/annotations/image/${imageId}`);
    },
    deleteImageAnnotations(imageId) {
        return this._fetch(`/annotations/image/${imageId}`, { method: 'DELETE' });
    },
    createBatchAnnotations(annotations) {
        return this._fetch('/annotations/batch', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(annotations)
        });
    },

    // ---- Training ----
    startTraining(projectId, epochs = 50, batchSize = 16) {
        return this._fetch(`/training/${projectId}/train?epochs=${epochs}&batch_size=${batchSize}`, { method: 'POST' });
    },
    startAutoAnnotation(projectId, confidenceThreshold = 0.25) {
        return this._fetch(`/training/${projectId}/auto-annotate?confidence_threshold=${confidenceThreshold}`, { method: 'POST' });
    },
    getTaskStatus(taskId) {
        return this._fetch(`/training/task/${taskId}`);
    },
    cancelTask(taskId) {
        return this._fetch(`/training/task/${taskId}`, { method: 'DELETE' });
    },

    // ---- Export ----
    exportYolo(projectId) {
        return this._fetch(`/export/${projectId}/yolo`);
    },
    exportCoco(projectId) {
        return this._fetch(`/export/${projectId}/coco`);
    }
};
