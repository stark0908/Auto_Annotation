/**
 * Upload Page — upload images, manage classes, generate embeddings.
 * Fixes: delete class, scrollable image grid.
 */
function renderUploadPage() {
    const el = document.getElementById('page-content');
    if (!AppState.projectId) {
        el.innerHTML = `<div class="empty-state"><p>Select a project first from the Projects page.</p></div>`;
        return;
    }

    el.innerHTML = `
        <div class="page-header">
            <h2>Upload Dataset</h2>
            <p>Project: <strong>${AppState.projectName}</strong></p>
        </div>

        <!-- Classes -->
        <div class="card section">
            <div class="card-header">
                <h3>Define Classes</h3>
            </div>
            <div class="flex gap-8 mb-12">
                <input class="input" type="text" id="class-name-input" placeholder="Class name (e.g. car)" style="flex:1;">
                <input type="color" id="class-color-input" value="#3b82f6">
                <button class="btn btn-primary btn-sm" onclick="addClass()">Add</button>
            </div>
            <div id="class-list" class="inline-class-list"></div>
        </div>

        <!-- Upload -->
        <div class="card section">
            <div class="card-header">
                <h3>Upload Images</h3>
            </div>
            <div id="upload-zone" class="upload-zone" onclick="document.getElementById('file-input').click()">
                <div class="upload-icon">+</div>
                <p>Click or drag images here to upload</p>
                <p style="font-size:0.75rem; margin-top:4px; color:var(--text-muted)">JPG, PNG, BMP</p>
            </div>
            <input type="file" id="file-input" multiple accept="image/*" style="display:none" onchange="handleFileUpload(this.files)">
            <div id="upload-progress" class="mt-12" style="display:none;">
                <div class="progress-bar"><div class="fill" id="upload-progress-bar"></div></div>
                <small id="upload-progress-text" style="color:var(--text-secondary);"></small>
            </div>
        </div>

        <!-- Uploaded Images -->
        <div class="card section">
            <div class="card-header">
                <h3>Uploaded Images</h3>
                <span id="image-count" class="badge badge-info">0</span>
            </div>
            <div id="image-grid-container" class="image-grid-scroll">
                <div id="image-grid" class="image-grid"></div>
            </div>
        </div>

        <!-- Embeddings -->
        <div class="card section">
            <div class="card-header">
                <h3>Generate Embeddings</h3>
            </div>
            <p style="font-size:0.85rem; color:var(--text-secondary); margin-bottom:12px;">
                Required for active learning. CLIP embeddings will be computed for all images.
            </p>
            <button class="btn btn-primary" onclick="generateEmbeddings()">Generate Embeddings</button>
        </div>
    `;

    setupDragDrop();
    loadClasses();
    loadUploadedImages();
}

function setupDragDrop() {
    const zone = document.getElementById('upload-zone');
    if (!zone) return;
    zone.addEventListener('dragover', (e) => { e.preventDefault(); zone.classList.add('dragover'); });
    zone.addEventListener('dragleave', () => zone.classList.remove('dragover'));
    zone.addEventListener('drop', (e) => {
        e.preventDefault();
        zone.classList.remove('dragover');
        handleFileUpload(e.dataTransfer.files);
    });
}

async function loadClasses() {
    try {
        const classes = await API.listClasses(AppState.projectId);
        AppState.classes = classes;
        const list = document.getElementById('class-list');
        if (!list) return;
        if (classes.length === 0) {
            list.innerHTML = '<span style="color:var(--text-muted); font-size:0.85rem;">No classes defined yet.</span>';
            return;
        }
        list.innerHTML = classes.map(c => `
            <span class="class-tag">
                <span class="dot" style="background:${c.color}"></span>
                ${c.name}
                <button class="class-delete-btn" onclick="deleteClass(${c.id}, '${c.name.replace(/'/g, "\\'")}')" title="Delete class">&times;</button>
            </span>
        `).join('');
    } catch (e) {
        console.error('Failed to load classes:', e);
    }
}

async function addClass() {
    const nameEl = document.getElementById('class-name-input');
    const colorEl = document.getElementById('class-color-input');
    const name = nameEl.value.trim();
    const color = colorEl.value;

    if (!name) { showToast('Enter a class name', 'error'); return; }

    try {
        await API.createClass(AppState.projectId, name, color);
        nameEl.value = '';
        showToast(`Class "${name}" added`, 'success');
        loadClasses();
    } catch (e) {
        showToast(`Error: ${e.message}`, 'error');
    }
}

async function deleteClass(classId, className) {
    if (!confirm(`Delete class "${className}"? This won't delete existing annotations.`)) return;
    try {
        await API.deleteClass(AppState.projectId, classId);
        showToast(`Class "${className}" deleted`, 'info');
        loadClasses();
    } catch (e) {
        showToast(`Error: ${e.message}`, 'error');
    }
}

async function handleFileUpload(files) {
    if (!files || files.length === 0) return;

    const progressDiv = document.getElementById('upload-progress');
    const progressBar = document.getElementById('upload-progress-bar');
    const progressText = document.getElementById('upload-progress-text');

    progressDiv.style.display = 'block';
    progressBar.style.width = '30%';
    progressText.textContent = `Uploading ${files.length} files...`;

    try {
        const result = await API.uploadImages(AppState.projectId, files);
        progressBar.style.width = '100%';
        progressText.textContent = `Uploaded ${result.uploaded} files${result.errors > 0 ? `, ${result.errors} errors` : ''}`;
        showToast(`Uploaded ${result.uploaded} images`, 'success');
        loadUploadedImages();
    } catch (e) {
        progressText.textContent = `Upload failed: ${e.message}`;
        showToast(`Upload failed: ${e.message}`, 'error');
    }
}

async function loadUploadedImages() {
    const grid = document.getElementById('image-grid');
    const countEl = document.getElementById('image-count');
    if (!grid) return;

    try {
        const images = await API.listImages(AppState.projectId);
        countEl.textContent = images.length;

        if (images.length === 0) {
            grid.innerHTML = '<span style="color:var(--text-muted); font-size:0.85rem;">No images uploaded yet.</span>';
            return;
        }

        grid.innerHTML = images.map(img => `
            <div class="image-thumb">
                <img src="${API.getImageUrl(img.id)}" alt="${img.filename}" loading="lazy">
                <span class="status-dot ${img.status.toLowerCase()}"></span>
            </div>
        `).join('');
    } catch (e) {
        grid.innerHTML = `<span style="color:var(--danger)">Error loading images</span>`;
    }
}

async function generateEmbeddings() {
    try {
        const result = await API.generateEmbeddings(AppState.projectId);
        TaskTracker.add('Embeddings', result.task_id);
        showToast('Embedding generation started!', 'info');
    } catch (e) {
        showToast(`Error: ${e.message}`, 'error');
    }
}
