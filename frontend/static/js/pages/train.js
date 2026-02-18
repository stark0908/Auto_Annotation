/**
 * Train Page — training, auto-annotation, logs, metrics.
 * Fixes: correct annotated count, terminal logs, training graph.
 */
function renderTrainPage() {
    const el = document.getElementById('page-content');
    if (!AppState.projectId) {
        el.innerHTML = `<div class="empty-state"><p>Select a project first.</p></div>`;
        return;
    }

    el.innerHTML = `
        <div class="page-header">
            <h2>Train Model</h2>
            <p>Project: <strong>${AppState.projectName}</strong></p>
        </div>

        <!-- Readiness -->
        <div class="card section">
            <h3>Training Readiness</h3>
            <div id="readiness-metrics" class="metrics-row"></div>
            <div id="readiness-status"></div>
        </div>

        <!-- Training Config -->
        <div class="card section">
            <h3>Training Configuration</h3>
            <div class="two-col">
                <div class="slider-group">
                    <label>Epochs <span class="slider-value" id="epochs-value">50</span></label>
                    <input type="range" min="10" max="200" step="10" value="50" id="epochs-slider"
                        oninput="document.getElementById('epochs-value').textContent=this.value">
                </div>
                <div class="slider-group">
                    <label>Batch Size <span class="slider-value" id="batch-value">16</span></label>
                    <input type="range" min="2" max="64" step="2" value="16" id="batch-slider"
                        oninput="document.getElementById('batch-value').textContent=this.value">
                </div>
            </div>
            <div class="flex gap-8 mt-12">
                <button class="btn btn-primary btn-lg" onclick="startTraining()">Start Training</button>
                <button class="btn btn-sm" onclick="loadReadiness()">Refresh Stats</button>
            </div>
        </div>

        <!-- Auto Annotation -->
        <div class="card section">
            <h3>Auto-Annotation</h3>
            <p style="font-size:0.85rem; color:var(--text-secondary); margin-bottom:12px;">
                Use trained model to automatically annotate remaining images.
            </p>
            <div class="slider-group mb-12">
                <label>Confidence Threshold <span class="slider-value" id="conf-value">0.25</span></label>
                <input type="range" min="0" max="1" step="0.05" value="0.25" id="conf-slider"
                    oninput="document.getElementById('conf-value').textContent=parseFloat(this.value).toFixed(2)">
            </div>
            <button class="btn btn-primary" onclick="startAutoAnnotation()">Auto-Annotate Remaining</button>
        </div>

        <!-- Training Logs -->
        <div class="card section">
            <h3>Training Logs</h3>
            <div id="training-logs" class="terminal-output">
                <span class="terminal-muted">No training logs yet. Start training to see output here.</span>
            </div>
        </div>

        <!-- Training Metrics Graph -->
        <div class="card section" id="metrics-graph-section" style="display:none;">
            <h3>Training Metrics</h3>
            <canvas id="metrics-canvas" width="800" height="300"></canvas>
        </div>
    `;

    loadReadiness();
}

async function loadReadiness() {
    const metricsEl = document.getElementById('readiness-metrics');
    const statusEl = document.getElementById('readiness-status');

    metricsEl.innerHTML = '<div class="alert-banner info">Loading stats...</div>';

    try {
        const [images, classes] = await Promise.all([
            API.listImages(AppState.projectId),
            API.listClasses(AppState.projectId)
        ]);

        const annotatedCount = images.filter(i => i.status === 'annotated').length;

        metricsEl.innerHTML = `
            <div class="metric">
                <div class="metric-value">${images.length}</div>
                <div class="metric-label">Total Images</div>
            </div>
            <div class="metric">
                <div class="metric-value">${annotatedCount}</div>
                <div class="metric-label">Annotated</div>
            </div>
            <div class="metric">
                <div class="metric-value">${images.length - annotatedCount}</div>
                <div class="metric-label">Unannotated</div>
            </div>
            <div class="metric">
                <div class="metric-value">${classes.length}</div>
                <div class="metric-label">Classes</div>
            </div>
            <div class="metric">
                <div class="metric-value">${images.length > 0 ? Math.round(annotatedCount / images.length * 100) : 0}%</div>
                <div class="metric-label">Progress</div>
            </div>
        `;

        if (annotatedCount < 5) {
            statusEl.innerHTML = `<div class="alert-banner warning">Need at least 5 annotated images. You have ${annotatedCount}.</div>`;
        } else if (classes.length === 0) {
            statusEl.innerHTML = `<div class="alert-banner error">No classes defined. Add classes in Upload page.</div>`;
        } else {
            statusEl.innerHTML = `<div class="alert-banner success">Ready to train! ${annotatedCount} annotated images across ${classes.length} classes.</div>`;
        }
    } catch (e) {
        metricsEl.innerHTML = `<div class="alert-banner error">Error: ${e.message}</div>`;
    }
}


let trainingLogInterval = null;

async function startTraining() {
    const epochs = parseInt(document.getElementById('epochs-slider').value);
    const batchSize = parseInt(document.getElementById('batch-slider').value);
    const logsEl = document.getElementById('training-logs');

    try {
        const result = await API.startTraining(AppState.projectId, epochs, batchSize);
        TaskTracker.add('Training', result.task_id);
        showToast('Training started', 'info');

        // Start polling logs
        logsEl.innerHTML = '<span class="terminal-muted">Training starting...</span>\n';
        startLogPolling(result.task_id);
    } catch (e) {
        showToast(`Error: ${e.message}`, 'error');
    }
}

function startLogPolling(taskId) {
    if (trainingLogInterval) clearInterval(trainingLogInterval);
    const logsEl = document.getElementById('training-logs');
    let logOffset = 0;

    trainingLogInterval = setInterval(async () => {
        try {
            // Fetch incremental logs
            const logData = await API.getTrainingLogs(AppState.projectId, logOffset);
            if (logData.content) {
                // Strip ANSI escape codes for clean display
                const clean = logData.content.replace(/\x1b\[[0-9;]*m/g, '');
                logsEl.textContent += clean;
                logOffset = logData.offset;
                logsEl.scrollTop = logsEl.scrollHeight;
            }

            // Also check task completion
            const status = await API.getTaskStatus(taskId);
            if (status.status === 'completed') {
                const now = new Date().toLocaleTimeString();
                logsEl.textContent += `\n[${now}] Training completed!\n`;
                if (status.result) {
                    logsEl.textContent += `Result: ${JSON.stringify(status.result, null, 2)}\n`;
                }
                clearInterval(trainingLogInterval);
                trainingLogInterval = null;
                loadReadiness();
            } else if (status.status === 'failed') {
                const now = new Date().toLocaleTimeString();
                logsEl.textContent += `\n[${now}] Training FAILED\n`;
                if (status.error) {
                    logsEl.textContent += `Error: ${status.error}\n`;
                }
                if (status.result && status.result.message) {
                    logsEl.textContent += `Details: ${status.result.message}\n`;
                }
                clearInterval(trainingLogInterval);
                trainingLogInterval = null;
            }
        } catch (e) {
            // ignore polling errors
        }
    }, 2000);
}

function drawMetricsGraph(data) {
    const section = document.getElementById('metrics-graph-section');
    section.style.display = 'block';
    const canvas = document.getElementById('metrics-canvas');
    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;

    ctx.clearRect(0, 0, w, h);

    if (data.length < 2) return;

    // Draw grid
    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = 1;
    for (let i = 0; i < 5; i++) {
        const y = 20 + (h - 40) * i / 4;
        ctx.beginPath();
        ctx.moveTo(60, y);
        ctx.lineTo(w - 20, y);
        ctx.stroke();
        ctx.fillStyle = '#94a3b8';
        ctx.font = '11px Inter, sans-serif';
        ctx.textAlign = 'right';
        ctx.fillText((1 - i / 4).toFixed(2), 55, y + 4);
    }

    // Draw loss line
    const maxLoss = Math.max(...data.map(d => d.loss || 0), 1);
    const padL = 60, padR = 20, padT = 20, padB = 20;
    const graphW = w - padL - padR;
    const graphH = h - padT - padB;

    ctx.strokeStyle = '#3b82f6';
    ctx.lineWidth = 2;
    ctx.beginPath();
    data.forEach((d, i) => {
        const x = padL + (i / (data.length - 1)) * graphW;
        const y = padT + (1 - (d.loss || 0) / maxLoss) * graphH;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
    });
    ctx.stroke();

    // Labels
    ctx.fillStyle = '#3b82f6';
    ctx.font = 'bold 12px Inter, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('Loss', padL + 5, padT + 12);

    // mAP if available
    if (data[0].mAP !== undefined) {
        ctx.strokeStyle = '#22c55e';
        ctx.lineWidth = 2;
        ctx.beginPath();
        data.forEach((d, i) => {
            const x = padL + (i / (data.length - 1)) * graphW;
            const y = padT + (1 - (d.mAP || 0)) * graphH;
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        });
        ctx.stroke();

        ctx.fillStyle = '#22c55e';
        ctx.fillText('mAP', padL + 50, padT + 12);
    }
}

async function startAutoAnnotation() {
    const conf = parseFloat(document.getElementById('conf-slider').value);

    try {
        const result = await API.startAutoAnnotation(AppState.projectId, conf);
        TaskTracker.add('Auto-Annotation', result.task_id);
        showToast('Auto-annotation started', 'info');

        const logsEl = document.getElementById('training-logs');
        logsEl.innerHTML += `\n[${new Date().toLocaleTimeString()}] Auto-annotation started (confidence: ${conf})\n`;
    } catch (e) {
        showToast(`Error: ${e.message}`, 'error');
    }
}
