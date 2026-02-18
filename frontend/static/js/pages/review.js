/**
 * Review Page — Review and correct annotations.
 * 
 * Layout: Top-Bottom
 * - Top: Stats + Filters + Horizontal image strip
 * - Bottom: Canvas (left) + Annotation sidebar (right)
 */

let reviewCanvas = null;
let allReviewImages = [];
let filteredImages = [];
let currentReviewIndex = 0;
let currentFilter = 'all';

function renderReviewPage() {
    const el = document.getElementById('page-content');
    if (!AppState.projectId) {
        el.innerHTML = `<div class="empty-state"><p>Select a project first.</p></div>`;
        return;
    }

    el.innerHTML = `
        <!-- Top Bar: Stats + Filters -->
        <div class="review-topbar">
            <div class="review-topbar-left">
                <h2 style="margin:0;">Review</h2>
                <div class="review-stats" id="review-stats"></div>
            </div>
            <div class="review-topbar-right">
                <div class="filter-bar">
                    <button class="filter-btn active" data-filter="all" onclick="filterReviewImages('all')">All</button>
                    <button class="filter-btn" data-filter="manual" onclick="filterReviewImages('manual')">Manual</button>
                    <button class="filter-btn" data-filter="auto_annotated" onclick="filterReviewImages('auto_annotated')">Auto</button>
                    <button class="filter-btn" data-filter="corrected" onclick="filterReviewImages('corrected')">Done</button>
                </div>
                <button class="btn btn-sm" onclick="exportYolo()">Export YOLO</button>
            </div>
        </div>

        <!-- Image Strip -->
        <div class="review-strip" id="review-strip"></div>

        <!-- Bottom: Canvas + Sidebar -->
        <div class="review-workspace">
            <!-- Canvas Area -->
            <div class="review-canvas-area">
                <div class="canvas-header">
                    <div id="review-image-info" style="font-size:0.85rem;">No image selected</div>
                    <div class="flex gap-8">
                        <button class="btn btn-sm" onclick="prevReviewImage()">Prev</button>
                        <span id="review-counter" style="font-size:0.8rem; color:var(--text-secondary); align-self:center;">0 / 0</span>
                        <button class="btn btn-sm" onclick="nextReviewImage()">Next</button>
                        <button class="btn btn-sm btn-primary" onclick="saveCorrection()">Save / Confirm</button>
                    </div>
                </div>
                <div id="review-canvas-container" class="canvas-container" style="flex:1;">
                    <div class="empty-state"><p>Select an image from the strip above</p></div>
                </div>
            </div>

            <!-- Annotation Sidebar -->
            <div class="annotation-sidebar">
                <div class="card">
                    <h3>Classes</h3>
                    <div id="review-class-list" class="class-selector"></div>
                </div>
                <div class="card" style="flex:1; overflow-y:auto;">
                    <div class="flex-between">
                        <h3>Annotations <span id="review-ann-count" class="badge badge-info">0</span></h3>
                        <button class="btn btn-sm btn-danger" onclick="clearReviewAnnotations()">Clear</button>
                    </div>
                    <div id="review-annotation-list"></div>
                </div>
                <div class="card">
                    <h3>Image Info</h3>
                    <div id="review-img-detail" style="font-size:0.8rem; color:var(--text-secondary);">No image loaded</div>
                </div>
            </div>
        </div>
    `;

    initReview();
}

async function initReview() {
    const container = document.getElementById('review-canvas-container');
    if (container) {
        reviewCanvas = new AnnotationCanvas(container);
        reviewCanvas.onAnnotationsChange = renderReviewAnnotationList;
    }

    await Promise.all([
        loadReviewClasses(),
        loadReviewImages()
    ]);
}

async function loadReviewClasses() {
    try {
        AppState.classes = await API.listClasses(AppState.projectId);
        renderReviewClasses();
    } catch (e) {
        showToast('Failed to load classes', 'error');
    }
}

function renderReviewClasses() {
    const list = document.getElementById('review-class-list');
    if (!list) return;

    list.innerHTML = AppState.classes.map(c => `
        <div class="class-item" onclick="selectReviewClass(this, ${c.id}, '${c.name}', '${c.color}')">
            <span class="class-color" style="background:${c.color}"></span>
            ${c.name}
        </div>
    `).join('');

    if (AppState.classes.length > 0) {
        const first = list.querySelector('.class-item');
        if (first) first.click();
    }
}

function selectReviewClass(el, id, name, color) {
    document.querySelectorAll('#review-class-list .class-item').forEach(i => i.classList.remove('active'));
    el.classList.add('active');
    if (reviewCanvas) reviewCanvas.setClass(id, name, color);
}

async function loadReviewImages() {
    try {
        allReviewImages = await API.listImages(AppState.projectId);
        updateReviewStats();
        filterReviewImages(currentFilter);
    } catch (e) {
        showToast('Failed to load images', 'error');
    }
}

function updateReviewStats() {
    const statsEl = document.getElementById('review-stats');
    if (!statsEl) return;

    const manual = allReviewImages.filter(i => i.status === 'annotated').length;
    const auto = allReviewImages.filter(i => i.status === 'auto_annotated').length;
    const corrected = allReviewImages.filter(i => i.status === 'corrected').length;
    const total = allReviewImages.length;

    statsEl.innerHTML = `
        <span class="stat-chip blue">${manual} Manual</span>
        <span class="stat-chip orange">${auto} Auto</span>
        <span class="stat-chip green">${corrected} Done</span>
        <span style="font-size:0.8rem; color:var(--text-muted);">${total} total</span>
    `;
}

function filterReviewImages(status) {
    currentFilter = status;

    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.filter === status);
    });

    if (status === 'all') {
        filteredImages = [...allReviewImages];
    } else if (status === 'manual') {
        filteredImages = allReviewImages.filter(i => i.status === 'annotated');
    } else {
        filteredImages = allReviewImages.filter(i => i.status === status);
    }

    renderReviewStrip();

    if (filteredImages.length > 0) {
        currentReviewIndex = 0;
        loadReviewImage();
    } else {
        if (reviewCanvas) {
            reviewCanvas.image = null;
            reviewCanvas.render();
        }
        const info = document.getElementById('review-image-info');
        if (info) info.textContent = 'No images match this filter';
        const counter = document.getElementById('review-counter');
        if (counter) counter.textContent = '0 / 0';
    }
}

function renderReviewStrip() {
    const strip = document.getElementById('review-strip');
    if (!strip) return;

    if (filteredImages.length === 0) {
        strip.innerHTML = '<div style="padding:12px; color:var(--text-muted); font-size:0.85rem;">No images found</div>';
        return;
    }

    strip.innerHTML = filteredImages.map((img, i) => `
        <div class="strip-thumb ${i === currentReviewIndex ? 'active' : ''}" onclick="selectReviewImage(${i})" title="${img.filename}">
            <img src="${API.getImageUrl(img.id)}" loading="lazy">
            <span class="strip-dot ${img.status}"></span>
        </div>
    `).join('');

    // Scroll active into view
    const activeThumb = strip.querySelector('.strip-thumb.active');
    if (activeThumb) {
        activeThumb.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    }
}

function selectReviewImage(index) {
    currentReviewIndex = index;
    renderReviewStrip();
    loadReviewImage();
}

async function loadReviewImage() {
    if (!reviewCanvas || filteredImages.length === 0) return;

    const img = filteredImages[currentReviewIndex];
    const info = document.getElementById('review-image-info');
    const counter = document.getElementById('review-counter');
    const detail = document.getElementById('review-img-detail');

    if (counter) counter.textContent = `${currentReviewIndex + 1} / ${filteredImages.length}`;
    if (info) info.innerHTML = `<strong>${img.filename}</strong> <span class="badge badge-${getStatusBadge(img.status)}">${formatStatus(img.status)}</span>`;

    try {
        await reviewCanvas.loadImage(API.getImageUrl(img.id));

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
        reviewCanvas.setAnnotations(mapped);
        renderReviewAnnotationList(mapped);

        if (detail) {
            detail.innerHTML = `
                <div>${img.filename}</div>
                <div>${img.width} x ${img.height}</div>
                <div>Status: <span class="badge badge-${getStatusBadge(img.status)}">${formatStatus(img.status)}</span></div>
                <div>${anns.length} annotation${anns.length !== 1 ? 's' : ''}</div>
            `;
        }
    } catch (e) {
        showToast('Failed to load image', 'error');
    }
}

function getStatusBadge(status) {
    switch (status) {
        case 'annotated': return 'primary';
        case 'auto_annotated': return 'warning';
        case 'corrected': return 'success';
        default: return 'secondary';
    }
}

function formatStatus(status) {
    switch (status) {
        case 'annotated': return 'Manual';
        case 'auto_annotated': return 'Auto';
        case 'corrected': return 'Done';
        case 'unannotated': return 'None';
        default: return status;
    }
}

function prevReviewImage() {
    if (currentReviewIndex > 0) {
        currentReviewIndex--;
        selectReviewImage(currentReviewIndex);
    }
}

function nextReviewImage() {
    if (currentReviewIndex < filteredImages.length - 1) {
        currentReviewIndex++;
        selectReviewImage(currentReviewIndex);
    }
}

async function saveCorrection() {
    if (!reviewCanvas || filteredImages.length === 0) return;

    const img = filteredImages[currentReviewIndex];
    const anns = reviewCanvas.getAnnotations();

    try {
        await API.deleteImageAnnotations(img.id);

        if (anns.length > 0) {
            const batchData = anns.map(a => ({
                image_id: img.id,
                class_id: a.class_id,
                bbox: a.bbox,
                source: 'corrected'
            }));
            await API.createBatchAnnotations(batchData);
        }

        showToast('Saved & confirmed', 'success');

        // Update local state
        img.status = 'corrected';
        // Also update in the master list
        const master = allReviewImages.find(m => m.id === img.id);
        if (master) master.status = 'corrected';

        updateReviewStats();
        renderReviewStrip();

        // Auto-advance to next
        if (currentReviewIndex < filteredImages.length - 1) {
            currentReviewIndex++;
            loadReviewImage();
            renderReviewStrip();
        }
    } catch (e) {
        showToast(`Save failed: ${e.message}`, 'error');
    }
}

function clearReviewAnnotations() {
    if (!reviewCanvas) return;
    reviewCanvas.undoStack.push([...reviewCanvas.annotations]);
    reviewCanvas.annotations = [];
    reviewCanvas.render();
    renderReviewAnnotationList([]);
}

function renderReviewAnnotationList(annotations) {
    const list = document.getElementById('review-annotation-list');
    const countEl = document.getElementById('review-ann-count');
    if (!list) return;

    if (countEl) countEl.textContent = annotations.length;

    if (annotations.length === 0) {
        list.innerHTML = '<p style="color:var(--text-muted); font-size:0.8rem; margin-top:8px;">No annotations</p>';
        return;
    }

    list.innerHTML = `
        <table class="annotation-table">
            <thead>
                <tr><th>Class</th><th>Position</th><th></th></tr>
            </thead>
            <tbody>
                ${annotations.map((a, i) => `
                    <tr class="annotation-row"
                        onmouseenter="if(reviewCanvas){reviewCanvas.hoveredAnnotation=${i};reviewCanvas.render()}"
                        onmouseleave="if(reviewCanvas){reviewCanvas.hoveredAnnotation=-1;reviewCanvas.render()}">
                        <td>
                            <span class="class-color" style="background:${a.color}; display:inline-block; width:10px; height:10px; border-radius:2px; vertical-align:middle;"></span>
                            ${a.className}
                        </td>
                        <td class="mono">${(a.bbox.x).toFixed(3)}, ${(a.bbox.y).toFixed(3)}</td>
                        <td><button class="annotation-delete" onclick="reviewCanvas.deleteAnnotation(${i})">x</button></td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    `;
}

async function exportYolo() {
    try {
        showToast('Exporting...', 'info');
        const result = await API.exportYolo(AppState.projectId);
        showToast(`Exported to ${result.path}`, 'success');
    } catch (e) {
        showToast(`Export failed: ${e.message}`, 'error');
    }
}
