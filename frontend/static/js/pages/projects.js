/**
 * Projects Page
 */
function renderProjectsPage() {
    const el = document.getElementById('page-content');
    el.innerHTML = `
        <div class="page-header">
            <h2>Projects</h2>
            <p>Create and manage annotation projects</p>
        </div>
        <div class="flex-between mb-16">
            <div></div>
            <button class="btn btn-primary" onclick="showCreateProjectModal()">+ New Project</button>
        </div>
        <div id="projects-grid" class="card-grid">
            <div class="empty-state"><p>Loading...</p></div>
        </div>
    `;
    loadProjects();
}

async function loadProjects() {
    const grid = document.getElementById('projects-grid');
    try {
        const projects = await API.listProjects();
        if (projects.length === 0) {
            grid.innerHTML = `<div class="empty-state"><p>No projects yet. Create your first project!</p></div>`;
            return;
        }
        grid.innerHTML = projects.map(p => `
            <div class="card card-clickable" onclick="selectProject('${p.id}', '${p.name.replace(/'/g, "\\'")}')">
                <h3>${p.name}</h3>
                <p style="color:var(--text-secondary); font-size:0.85rem; margin:8px 0;">${p.description || 'No description'}</p>
                <div class="flex-between" style="margin-top:12px;">
                    <span class="badge badge-info">${p.status}</span>
                    <small style="color:var(--text-muted)">${new Date(p.created_at).toLocaleDateString()}</small>
                </div>
            </div>
        `).join('');
    } catch (e) {
        grid.innerHTML = `<div class="empty-state"><p>Error: ${e.message}</p></div>`;
    }
}

function showCreateProjectModal() {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
        <div class="modal">
            <h2>Create New Project</h2>
            <div class="form-group">
                <label>Project Name</label>
                <input class="input" type="text" id="new-project-name" placeholder="e.g. Vehicle Detection" autofocus>
            </div>
            <div class="form-group">
                <label>Description (optional)</label>
                <textarea class="input" id="new-project-desc" rows="3" placeholder="What are you annotating?"></textarea>
            </div>
            <div class="modal-actions">
                <button class="btn" onclick="this.closest('.modal-overlay').remove()">Cancel</button>
                <button class="btn btn-primary" onclick="createProject()">Create</button>
            </div>
        </div>
    `;
    document.body.appendChild(overlay);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
    document.getElementById('new-project-name').focus();
}

async function createProject() {
    const name = document.getElementById('new-project-name').value.trim();
    const desc = document.getElementById('new-project-desc').value.trim();
    if (!name) { showToast('Enter a project name', 'error'); return; }

    try {
        const project = await API.createProject(name, desc || null);
        document.querySelector('.modal-overlay')?.remove();
        showToast(`Project "${name}" created!`, 'success');
        selectProject(project.id, project.name);
    } catch (e) {
        showToast(`Error: ${e.message}`, 'error');
    }
}

function selectProject(id, name) {
    AppState.projectId = id;
    AppState.projectName = name;
    saveState();
    document.getElementById('current-project-indicator').style.display = 'block';
    document.getElementById('current-project-name').textContent = name;
    showToast(`Selected: ${name}`, 'info');
    navigateTo('upload');
}
