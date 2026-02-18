/**
 * Task Tracker — persistent background task indicator.
 */
const TaskTracker = {
    tasks: {},
    pollMs: 3000,

    add(name, taskId) {
        this.tasks[name] = { id: taskId, status: 'pending' };
        this._startPolling(name);
        this.render();
    },

    async cancel(name) {
        const task = this.tasks[name];
        if (!task) return;
        try {
            await API.cancelTask(task.id);
            this._stopPolling(name);
            delete this.tasks[name];
            this.render();
            showToast(`Cancelled: ${name}`, 'info');
        } catch (e) {
            showToast(`Cancel failed: ${e.message}`, 'error');
        }
    },

    remove(name) {
        this._stopPolling(name);
        delete this.tasks[name];
        this.render();
    },

    _startPolling(name) {
        this._stopPolling(name);
        const interval = setInterval(async () => {
            const task = this.tasks[name];
            if (!task) { clearInterval(interval); return; }
            try {
                const status = await API.getTaskStatus(task.id);
                task.status = status.status;
                task.result = status.result;
                this.render();

                if (status.status === 'completed' || status.status === 'failed') {
                    this._stopPolling(name);
                    if (status.status === 'completed') {
                        showToast(`${name} completed`, 'success');
                    } else {
                        showToast(`${name} failed`, 'error');
                    }
                }
            } catch (e) { /* ignore */ }
        }, this.pollMs);
        this.tasks[name]._interval = interval;
    },

    _stopPolling(name) {
        const task = this.tasks[name];
        if (task && task._interval) {
            clearInterval(task._interval);
            delete task._interval;
        }
    },

    render() {
        const panel = document.getElementById('task-panel');
        const list = document.getElementById('task-list');
        const names = Object.keys(this.tasks);

        if (names.length === 0) {
            panel.style.display = 'none';
            return;
        }

        panel.style.display = 'block';
        list.innerHTML = names.map(name => {
            const t = this.tasks[name];
            const statusClass = t.status === 'completed' ? 'completed'
                : t.status === 'failed' ? 'failed'
                    : t.status === 'running' ? 'running' : 'pending';
            const icon = t.status === 'completed' ? '[done]'
                : t.status === 'failed' ? '[fail]'
                    : '<span class="task-spinner"></span>';
            const cancelBtn = (t.status !== 'completed' && t.status !== 'failed')
                ? `<button class="task-cancel" onclick="TaskTracker.cancel('${name}')" title="Cancel">x</button>`
                : `<button class="task-cancel" onclick="TaskTracker.remove('${name}')" title="Dismiss">x</button>`;

            return `<div class="task-item ${statusClass}">
                ${icon}
                <span class="task-name">${name}</span>
                ${cancelBtn}
            </div>`;
        }).join('');
    }
};
