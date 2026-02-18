/**
 * Annotate Page — canvas annotation with active learning.
 * Fixes: added embeddings button, better annotation list.
 */
let annotationCanvas = null;
let currentImages = [];
let currentImageIndex = 0;

function renderAnnotatePage() {
    const el = document.getElementById('page-content');
    if (!AppState.projectId) {
        el.innerHTML = `<div class="empty-state"><p>Select a project first.</p></div>`;
        return;
    }

    el.innerHTML = `
        <div class="page-header flex-between">
            <div>
                <h2>Annotate</h2>
                <p>Project: <strong>${AppState.projectName}</strong></p>
            </div>
            <div class="flex gap-8">
                <button class="btn" onclick="generateEmbeddingsFromAnnotate()">Generate Embeddings</button>
                <button class="btn" onclick="getNextBatch()">Get Next Batch</button>
                <button class="btn" onclick="loadAllImages()">Load All Images</button>
            </div>
        </div>

        <!-- Stats Bar -->
        <div class="metrics-row" id="annotate-stats" style="margin-bottom:12px;"></div>

        <!-- Image Navigation -->
        <div class="image-nav" id="image-nav" style="display:none;">
            <button class="btn btn-sm" onclick="prevImage()">Prev</button>
            <span class="counter" id="image-counter">0 / 0</span>
            <button class="btn btn-sm" onclick="nextImage()">Next</button>
            <span style="flex:1;"></span>
            <button class="btn btn-sm btn-primary" onclick="saveAnnotations()">Save</button>
            <button class="btn btn-sm" onclick="annotationCanvas.undo()">Undo (Ctrl+Z)</button>
        </div>

        <!-- Main Layout: Canvas + Sidebar -->
        <div class="annotate-layout">
            <div class="canvas-container" id="canvas-container">
                <div class="empty-state"><p>Load images to start annotating</p></div>
            </div>
            <div class="annotation-sidebar">
                <!-- Class Selector -->
                <div class="card">
                    <h3>Classes</h3>
                    <div id="annotate-class-list" class="class-selector">
                        <span style="color:var(--text-muted); font-size:0.85rem;">Loading...</span>
                    </div>
                </div>

                <!-- Annotations List (file-like display) -->
                <div class="card" style="flex:1; overflow-y:auto;">
                    <div class="flex-between">
                        <h3>Annotations <span id="ann-count" class="badge badge-info" style="margin-left:6px;">0</span></h3>
                        <button class="btn btn-sm btn-danger" onclick="clearAnnotations()" title="Clear all">Clear</button>
                    </div>
                    <div id="annotation-list"></div>
                </div>

                <!-- Image Info -->
                <div class="card">
                    <h3>Image Info</h3>
                    <div id="image-info" style="font-size:0.8rem; color:var(--text-secondary);">
                        No image loaded
                    </div>
                </div>
            </div>
        </div>
    `;

    loadAnnotateStats();
    loadAnnotateClasses();
}

async function generateEmbeddingsFromAnnotate() {
    try {
        const result = await API.generateEmbeddings(AppState.projectId);
        TaskTracker.add('Embeddings', result.task_id);
        showToast('Embedding generation started', 'info');
    } catch (e) {
        showToast(`Error: ${e.message}`, 'error');
    }
}

async function loadAnnotateStats() {
    const statsEl = document.getElementById('annotate-stats');
    if (!statsEl) return;
    try {
        const [images, embStats] = await Promise.all([
            API.listImages(AppState.projectId),
            API.getEmbeddingStats(AppState.projectId)
        ]);
        const annotated = images.filter(i => i.status === 'annotated').length;
        const embBadge = embStats.ready
            ? '<span class="badge badge-success">Ready</span>'
            : embStats.with_embeddings > 0
                ? `<span class="badge badge-warning">${embStats.with_embeddings}/${embStats.total}</span>`
                : '<span class="badge badge-danger">Not Generated</span>';
        statsEl.innerHTML = `
            <div class="metric">
                <div class="metric-value">${images.length}</div>
                <div class="metric-label">Total Images</div>
            </div>
            <div class="metric">
                <div class="metric-value">${annotated}</div>
                <div class="metric-label">Annotated</div>
            </div>
            <div class="metric">
                <div class="metric-value">${images.length - annotated}</div>
                <div class="metric-label">Remaining</div>
            </div>
            <div class="metric">
                <div class="metric-value">${embBadge}</div>
                <div class="metric-label">Embeddings</div>
            </div>
            <div class="metric">
                <div class="metric-value">${images.length > 0 ? Math.round(annotated / images.length * 100) : 0}%</div>
                <div class="metric-label">Progress</div>
            </div>
        `;
    } catch (e) { /* ignore */ }
}



async function loadAnnotateClasses() {
    try {
        const classes = await API.listClasses(AppState.projectId);
        AppState.classes = classes;
        const list = document.getElementById('annotate-class-list');
        if (!list) return;

        if (classes.length === 0) {
            list.innerHTML = '<span style="color:var(--text-muted); font-size:0.85rem;">Add classes in Upload page first.</span>';
            return;
        }

        list.innerHTML = classes.map((c, i) => `
            <div class="class-item${i === 0 ? ' active' : ''}" data-class-id="${c.id}" onclick="selectAnnotationClass(this, ${c.id}, '${c.name.replace(/'/g, "\\'")}', '${c.color}')">
                <span class="class-color" style="background:${c.color}"></span>
                ${c.name}
                <small style="color:var(--text-muted); margin-left:auto;">[${i + 1}]</small>
            </div>
        `).join('');

        if (classes.length > 0 && annotationCanvas) {
            annotationCanvas.setClass(classes[0].id, classes[0].name, classes[0].color);
        }

        document.removeEventListener('keydown', classShortcutHandler);
        document.addEventListener('keydown', classShortcutHandler);
    } catch (e) {
        console.error('Failed to load classes:', e);
    }
}

function classShortcutHandler(e) {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    const num = parseInt(e.key);
    if (num >= 1 && num <= 9 && AppState.classes && AppState.classes.length >= num) {
        const c = AppState.classes[num - 1];
        const items = document.querySelectorAll('.class-item');
        items.forEach(el => el.classList.remove('active'));
        if (items[num - 1]) items[num - 1].classList.add('active');
        if (annotationCanvas) annotationCanvas.setClass(c.id, c.name, c.color);
    }
}

function selectAnnotationClass(el, id, name, color) {
    document.querySelectorAll('.class-item').forEach(e => e.classList.remove('active'));
    el.classList.add('active');
    if (annotationCanvas) annotationCanvas.setClass(id, name, color);
}

function initCanvas() {
    const container = document.getElementById('canvas-container');
    if (!container) return;

    annotationCanvas = new AnnotationCanvas(container);
    annotationCanvas.onAnnotationsChange = (annotations) => {
        renderAnnotationList(annotations);
    };

    if (AppState.classes && AppState.classes.length > 0) {
        const c = AppState.classes[0];
        annotationCanvas.setClass(c.id, c.name, c.color);
    }
}

async function getNextBatch() {
    try {
        const result = await API.getNextBatch(AppState.projectId, 10, 'max_distance');
        currentImages = result.images;
        currentImageIndex = 0;
        showToast(`Selected ${result.selected} images (${result.strategy})`, 'info');
        if (currentImages.length > 0) {
            initCanvas();
            loadCurrentImage();
        }
    } catch (e) {
        showToast(`Error: ${e.message}`, 'error');
    }
}

async function loadAllImages() {
    try {
        const images = await API.listImages(AppState.projectId);
        currentImages = images;
        currentImageIndex = 0;
        showToast(`Loaded ${images.length} images`, 'info');
        if (currentImages.length > 0) {
            initCanvas();
            loadCurrentImage();
        }
    } catch (e) {
        showToast(`Error: ${e.message}`, 'error');
    }
}

async function loadCurrentImage() {
    if (!annotationCanvas || currentImages.length === 0) return;

    const img = currentImages[currentImageIndex];
    const nav = document.getElementById('image-nav');
    const counter = document.getElementById('image-counter');
    const info = document.getElementById('image-info');

    nav.style.display = 'flex';
    counter.textContent = `${currentImageIndex + 1} / ${currentImages.length}`;

    try {
        await annotationCanvas.loadImage(API.getImageUrl(img.id));

        const anns = await API.getImageAnnotations(img.id);
        const mapped = anns.map(a => {
            const cls = AppState.classes.find(c => c.id === a.class_id);
            return {
                id: a.id,
                classId: a.class_id,
                className: cls ? cls.name : `Class ${a.class_id}`,
                color: cls ? cls.color : '#888',
                bbox: a.bbox
            };
        });
        annotationCanvas.setAnnotations(mapped);
        renderAnnotationList(mapped);

        info.innerHTML = `
            <div><strong>${img.filename}</strong></div>
            <div>${img.width} x ${img.height}</div>
            <div>Status: <span class="badge badge-${img.status === 'annotated' ? 'success' : 'warning'}">${img.status}</span></div>
        `;
    } catch (e) {
        showToast(`Failed to load image: ${e.message}`, 'error');
    }
}

function prevImage() {
    if (currentImageIndex > 0) {
        currentImageIndex--;
        loadCurrentImage();
    }
}

function nextImage() {
    if (currentImageIndex < currentImages.length - 1) {
        currentImageIndex++;
        loadCurrentImage();
    }
}

function renderAnnotationList(annotations) {
    const list = document.getElementById('annotation-list');
    const countEl = document.getElementById('ann-count');
    if (!list) return;

    countEl.textContent = annotations.length;

    if (annotations.length === 0) {
        list.innerHTML = '<p style="color:var(--text-muted); font-size:0.8rem; margin-top:8px;">No annotations. Draw a bounding box on the image.</p>';
        return;
    }

    list.innerHTML = `
        <table class="annotation-table">
            <thead>
                <tr>
                    <th>Class</th>
                    <th>Position</th>
                    <th>Size</th>
                    <th></th>
                </tr>
            </thead>
            <tbody>
                ${annotations.map((a, i) => `
                    <tr class="annotation-row" onmouseenter="highlightAnnotation(${i})" onmouseleave="unhighlightAnnotation()">
                        <td>
                            <span class="class-color" style="background:${a.color}; display:inline-block; width:10px; height:10px; border-radius:2px; vertical-align:middle;"></span>
                            ${a.className}
                        </td>
                        <td class="mono">${(a.bbox.x).toFixed(3)}, ${(a.bbox.y).toFixed(3)}</td>
                        <td class="mono">${(a.bbox.w * 100).toFixed(1)}% x ${(a.bbox.h * 100).toFixed(1)}%</td>
                        <td><button class="annotation-delete" onclick="annotationCanvas.deleteAnnotation(${i})">x</button></td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    `;
}

function highlightAnnotation(index) {
    if (annotationCanvas) {
        annotationCanvas.hoveredAnnotation = index;
        annotationCanvas.render();
    }
}

function unhighlightAnnotation() {
    if (annotationCanvas) {
        annotationCanvas.hoveredAnnotation = -1;
        annotationCanvas.render();
    }
}

async function saveAnnotations() {
    if (!annotationCanvas || currentImages.length === 0) return;

    const img = currentImages[currentImageIndex];
    const anns = annotationCanvas.getAnnotations();

    try {
        await API.deleteImageAnnotations(img.id);

        if (anns.length > 0) {
            const batchData = anns.map(a => ({
                image_id: img.id,
                class_id: a.class_id,
                bbox: a.bbox,
                source: 'manual'
            }));
            await API.createBatchAnnotations(batchData);
        }

        showToast(`Saved ${anns.length} annotations`, 'success');
        loadAnnotateStats();
    } catch (e) {
        showToast(`Save failed: ${e.message}`, 'error');
    }
}

async function clearAnnotations() {
    if (!annotationCanvas) return;
    annotationCanvas.undoStack.push([...annotationCanvas.annotations]);
    annotationCanvas.annotations = [];
    annotationCanvas.render();
    renderAnnotationList([]);
}
