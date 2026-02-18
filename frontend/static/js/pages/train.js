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
                    <label>Batch Size <span class="slider-value" id="batch-value">8</span></label>
                    <input type="range" min="2" max="64" step="2" value="8" id="batch-slider"
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
            <div id="training-status" style="margin-bottom:8px;"></div>
            <div id="training-logs" class="terminal-output">
                <span class="terminal-muted">No training logs yet. Start training to see output here.</span>
            </div>
        </div>

        <!-- Training Metrics Table -->
        <div class="card section" id="metrics-table-section" style="display:none;">
            <h3>Epoch Metrics</h3>
            <div style="overflow-x:auto;">
                <table id="metrics-table" class="metrics-table">
                    <thead>
                        <tr>
                            <th>Epoch</th>
                            <th>Box Loss</th>
                            <th>Cls Loss</th>
                            <th>DFL Loss</th>
                            <th>Precision</th>
                            <th>Recall</th>
                            <th>mAP50</th>
                            <th>mAP50-95</th>
                            <th>V-Box</th>
                            <th>V-Cls</th>
                            <th>V-DFL</th>
                        </tr>
                    </thead>
                    <tbody id="metrics-tbody"></tbody>
                </table>
            </div>
        </div>

        <!-- Training Metrics Graph -->
        <div class="card section" id="metrics-graph-section" style="display:none;">
            <h3>Training Progress</h3>
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

        // Clear previous metrics
        logsEl.innerHTML = '<span class="terminal-muted">Training starting...</span>\n';
        const tbody = document.getElementById('metrics-tbody');
        if (tbody) tbody.innerHTML = '';

        startLogPolling(result.task_id);
    } catch (e) {
        showToast(`Error: ${e.message}`, 'error');
    }
}

function startLogPolling(taskId) {
    if (trainingLogInterval) clearInterval(trainingLogInterval);
    const logsEl = document.getElementById('training-logs');
    let lastEpoch = 0;
    let allEpochs = [];

    trainingLogInterval = setInterval(async () => {
        try {
            // Fetch new epoch metrics
            const logData = await API.getTrainingLogs(AppState.projectId, lastEpoch);

            // Update status message
            if (logData.status) {
                const statusEl = document.getElementById('training-status');
                if (statusEl) statusEl.textContent = logData.status;
            }

            // Add new epochs to table
            if (logData.epochs && logData.epochs.length > 0) {
                const section = document.getElementById('metrics-table-section');
                section.style.display = 'block';
                const tbody = document.getElementById('metrics-tbody');

                for (const ep of logData.epochs) {
                    allEpochs.push(ep);
                    lastEpoch = ep.epoch;

                    // Add row to table
                    const row = document.createElement('tr');
                    row.innerHTML = `
                        <td><strong>${ep.epoch}</strong></td>
                        <td>${ep.box_loss}</td>
                        <td>${ep.cls_loss}</td>
                        <td>${ep.dfl_loss}</td>
                        <td class="${ep.precision > 0.5 ? 'metric-good' : ''}">${ep.precision}</td>
                        <td class="${ep.recall > 0.5 ? 'metric-good' : ''}">${ep.recall}</td>
                        <td class="${ep.mAP50 > 0.5 ? 'metric-good' : ''}">${ep.mAP50}</td>
                        <td class="${ep.mAP50_95 > 0.3 ? 'metric-good' : ''}">${ep.mAP50_95}</td>
                        <td>${ep.val_box_loss}</td>
                        <td>${ep.val_cls_loss}</td>
                        <td>${ep.val_dfl_loss}</td>
                    `;
                    tbody.appendChild(row);

                    // Also update terminal with summary
                    const summary = `Epoch ${ep.epoch}: P=${ep.precision} R=${ep.recall} mAP50=${ep.mAP50} mAP50-95=${ep.mAP50_95} box=${ep.box_loss} cls=${ep.cls_loss}\n`;
                    if (lastEpoch === 1) {
                        logsEl.textContent = summary;
                    } else {
                        logsEl.textContent += summary;
                    }
                    logsEl.scrollTop = logsEl.scrollHeight;
                }

                // Update graph
                drawMetricsGraph(allEpochs);
            }

            // Check task completion
            const status = await API.getTaskStatus(taskId);
            if (status.status === 'completed') {
                const now = new Date().toLocaleTimeString();
                logsEl.textContent += `\n[${now}] Training completed!\n`;
                if (status.result) {
                    logsEl.textContent += `Model: ${status.result.model_path || 'N/A'}\n`;
                    logsEl.textContent += `Images used: ${status.result.num_images || 'N/A'}\n`;
                }
                clearInterval(trainingLogInterval);
                trainingLogInterval = null;
                loadReadiness();
            } else if (status.status === 'failed') {
                const now = new Date().toLocaleTimeString();
                logsEl.textContent += `\n[${now}] Training FAILED\n`;
                if (status.error) logsEl.textContent += `Error: ${status.error}\n`;
                if (status.result && status.result.message) logsEl.textContent += `${status.result.message}\n`;
                clearInterval(trainingLogInterval);
                trainingLogInterval = null;
            }
        } catch (e) {
            // ignore polling errors
        }
    }, 3000);
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

    const padL = 60, padR = 20, padT = 30, padB = 30;
    const graphW = w - padL - padR;
    const graphH = h - padT - padB;

    // Draw grid
    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
        const y = padT + graphH * i / 4;
        ctx.beginPath();
        ctx.moveTo(padL, y);
        ctx.lineTo(w - padR, y);
        ctx.stroke();
        ctx.fillStyle = '#94a3b8';
        ctx.font = '11px Inter, sans-serif';
        ctx.textAlign = 'right';
        ctx.fillText((1 - i / 4).toFixed(2), padL - 5, y + 4);
    }

    // Draw x-axis labels
    ctx.fillStyle = '#94a3b8';
    ctx.textAlign = 'center';
    const step = Math.max(1, Math.floor(data.length / 10));
    for (let i = 0; i < data.length; i += step) {
        const x = padL + (i / (data.length - 1)) * graphW;
        ctx.fillText(data[i].epoch, x, h - 5);
    }

    function drawLine(values, color, maxVal) {
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.beginPath();
        data.forEach((d, i) => {
            const x = padL + (i / (data.length - 1)) * graphW;
            const y = padT + (1 - values[i] / maxVal) * graphH;
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        });
        ctx.stroke();
    }

    // mAP50 (green)
    drawLine(data.map(d => d.mAP50), '#22c55e', 1);
    // mAP50-95 (blue)
    drawLine(data.map(d => d.mAP50_95), '#3b82f6', 1);
    // Precision (orange)
    drawLine(data.map(d => d.precision), '#f59e0b', 1);
    // Recall (purple)
    drawLine(data.map(d => d.recall), '#a855f7', 1);

    // Legend
    const legend = [
        { label: 'mAP50', color: '#22c55e' },
        { label: 'mAP50-95', color: '#3b82f6' },
        { label: 'Precision', color: '#f59e0b' },
        { label: 'Recall', color: '#a855f7' }
    ];
    let lx = padL + 10;
    ctx.font = 'bold 11px Inter, sans-serif';
    legend.forEach(item => {
        ctx.fillStyle = item.color;
        ctx.fillRect(lx, 8, 12, 12);
        ctx.fillText(item.label, lx + 16, 18);
        lx += ctx.measureText(item.label).width + 30;
    });
}

async function startAutoAnnotation() {
    const conf = parseFloat(document.getElementById('conf-slider').value);

    try {
        const result = await API.startAutoAnnotation(AppState.projectId, conf);
        TaskTracker.add('Auto-Annotation', result.task_id);
        showToast('Auto-annotation started', 'info');

        const logsEl = document.getElementById('training-logs');
        logsEl.textContent += `\n[${new Date().toLocaleTimeString()}] Auto-annotation started (confidence: ${conf})\n`;
    } catch (e) {
        showToast(`Error: ${e.message}`, 'error');
    }
}
