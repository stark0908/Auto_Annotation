/**
 * App — main router, state, and utilities.
 * State is persisted in localStorage so it survives page refreshes.
 */

// Global state — load from localStorage if available
const AppState = {
    projectId: localStorage.getItem('projectId') || null,
    projectName: localStorage.getItem('projectName') || null,
    classes: [],
    currentPage: 'projects'
};

// Save state to localStorage whenever it changes
function saveState() {
    if (AppState.projectId) {
        localStorage.setItem('projectId', AppState.projectId);
        localStorage.setItem('projectName', AppState.projectName);
    } else {
        localStorage.removeItem('projectId');
        localStorage.removeItem('projectName');
    }
}

// Page renderers
const Pages = {
    projects: renderProjectsPage,
    upload: renderUploadPage,
    annotate: renderAnnotatePage,
    train: renderTrainPage,
    review: renderReviewPage
};

/** Navigate to a page */
function navigateTo(page) {
    if (!Pages[page]) return;

    AppState.currentPage = page;
    window.location.hash = page;

    // Update nav links
    document.querySelectorAll('.nav-link').forEach(link => {
        link.classList.toggle('active', link.dataset.page === page);
    });

    // Render page
    Pages[page]();
}

/** Show toast notification */
function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 4000);
}

/** Init on page load */
window.addEventListener('DOMContentLoaded', () => {
    // Restore project indicator if we have a saved project
    if (AppState.projectId) {
        document.getElementById('current-project-indicator').style.display = 'block';
        document.getElementById('current-project-name').textContent = AppState.projectName;
    }

    // Read hash
    const hash = window.location.hash.slice(1) || 'projects';
    navigateTo(hash);
});

/** Handle hash changes */
window.addEventListener('hashchange', () => {
    const hash = window.location.hash.slice(1) || 'projects';
    navigateTo(hash);
});
