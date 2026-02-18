/**
 * Review Page — stats and export.
 */
function renderReviewPage() {
    const el = document.getElementById('page-content');
    if (!AppState.projectId) {
        el.innerHTML = `<div class="empty-state"><p>Select a project first.</p></div>`;
        return;
    }

    el.innerHTML = `
        <div class="page-header">
            <h2>Review and Export</h2>
            <p>Project: <strong>${AppState.projectName}</strong></p>
        </div>

        <div class="card section">
            <h3>Dataset Statistics</h3>
            <div id="review-metrics" class="metrics-row"></div>
        </div>

        <div class="card section">
            <h3>Annotated Samples</h3>
            <div id="sample-images" class="image-grid" style="grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));"></div>
        </div>

        <div class="card section">
            <h3>Export Dataset</h3>
            <p style="font-size:0.85rem; color:var(--text-secondary); margin-bottom:16px;">
                Export your annotated dataset in standard formats for training.
            </p>
            <div class="flex gap-12">
                <button class="btn btn-primary btn-lg" onclick="exportYolo()">Export YOLO Format</button>
                <button class="btn btn-lg" onclick="exportCoco()">Export COCO Format</button>
            </div>
            <div id="export-result" class="mt-16"></div>
        </div>
    `;

    loadReviewData();
}

async function loadReviewData() {
    try {
        const images = await API.listImages(AppState.projectId);
        const classes = await API.listClasses(AppState.projectId);
        const annotated = images.filter(i => i.status === 'annotated');
        const unannotated = images.filter(i => i.status !== 'annotated');

        document.getElementById('review-metrics').innerHTML = `
            <div class="metric">
                <div class="metric-value">${images.length}</div>
                <div class="metric-label">Total Images</div>
            </div>
            <div class="metric">
                <div class="metric-value">${annotated.length}</div>
                <div class="metric-label">Annotated</div>
            </div>
            <div class="metric">
                <div class="metric-value">${unannotated.length}</div>
                <div class="metric-label">Unannotated</div>
            </div>
            <div class="metric">
                <div class="metric-value">${classes.length}</div>
                <div class="metric-label">Classes</div>
            </div>
            <div class="metric">
                <div class="metric-value">${images.length > 0 ? Math.round(annotated.length / images.length * 100) : 0}%</div>
                <div class="metric-label">Progress</div>
            </div>
        `;

        const samples = annotated.slice(0, 12);
        const sampleGrid = document.getElementById('sample-images');

        if (samples.length === 0) {
            sampleGrid.innerHTML = '<span style="color:var(--text-muted);">No annotated images yet.</span>';
        } else {
            sampleGrid.innerHTML = samples.map(img => `
                <div class="image-thumb">
                    <img src="${API.getImageUrl(img.id)}" alt="${img.filename}" loading="lazy">
                    <span class="status-dot annotated"></span>
                </div>
            `).join('');
        }
    } catch (e) {
        document.getElementById('review-metrics').innerHTML = `<div class="alert-banner error">Error: ${e.message}</div>`;
    }
}

async function exportYolo() {
    const resultEl = document.getElementById('export-result');
    try {
        resultEl.innerHTML = '<div class="alert-banner info"><span class="task-spinner"></span> Exporting YOLO format...</div>';
        const result = await API.exportYolo(AppState.projectId);
        resultEl.innerHTML = `<div class="alert-banner success">YOLO export completed. Path: <code>${result.path}</code></div>`;
        showToast('YOLO export completed', 'success');
    } catch (e) {
        resultEl.innerHTML = `<div class="alert-banner error">Export failed: ${e.message}</div>`;
    }
}

async function exportCoco() {
    const resultEl = document.getElementById('export-result');
    try {
        resultEl.innerHTML = '<div class="alert-banner info"><span class="task-spinner"></span> Exporting COCO format...</div>';
        const result = await API.exportCoco(AppState.projectId);
        resultEl.innerHTML = `<div class="alert-banner success">COCO export completed. Path: <code>${result.path}</code></div>`;
        showToast('COCO export completed', 'success');
    } catch (e) {
        resultEl.innerHTML = `<div class="alert-banner error">Export failed: ${e.message}</div>`;
    }
}
