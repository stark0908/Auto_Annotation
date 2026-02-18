/**
 * Annotation Canvas — HTML5 Canvas for drawing bounding boxes.
 *
 * Handles:
 *  - Image rendering
 *  - Click-drag to draw bboxes
 *  - Display existing annotations with class colors
 *  - Delete annotation on click
 *  - Undo (Ctrl+Z)
 *  - Zoom with scroll, pan with middle mouse
 *  - Mouse coords → normalized YOLO coords
 */
class AnnotationCanvas {
    constructor(containerEl) {
        this.container = containerEl;
        this.canvas = document.createElement('canvas');
        this.ctx = this.canvas.getContext('2d');
        this.container.innerHTML = '';
        this.container.appendChild(this.canvas);

        // State
        this.image = null;
        this.imageW = 0;
        this.imageH = 0;
        this.annotations = [];    // [{ id, classId, className, color, bbox: {x,y,w,h} }]
        this.undoStack = [];
        this.selectedClassId = null;
        this.selectedClassName = '';
        this.selectedClassColor = '#3b82f6';

        // Drawing state
        this.isDrawing = false;
        this.drawStart = null;
        this.drawCurrent = null;

        // View transform
        this.scale = 1;
        this.offsetX = 0;
        this.offsetY = 0;
        this.isPanning = false;
        this.panStart = null;

        // Hover state
        this.hoveredAnnotation = -1;

        // Callbacks
        this.onAnnotationsChange = null;  // Called when annotations change

        this._bindEvents();
        this._resize();
        window.addEventListener('resize', () => this._resize());
    }

    /** Load an image by URL */
    loadImage(url) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.crossOrigin = 'anonymous';
            img.onload = () => {
                this.image = img;
                this.imageW = img.naturalWidth;
                this.imageH = img.naturalHeight;
                this.annotations = [];
                this.undoStack = [];
                this._fitImage();
                this.render();
                resolve();
            };
            img.onerror = reject;
            img.src = url;
        });
    }

    /** Set annotations (from backend) */
    setAnnotations(annotations) {
        this.annotations = annotations.map(a => ({ ...a }));
        this.render();
    }

    /** Set the current class for drawing */
    setClass(id, name, color) {
        this.selectedClassId = id;
        this.selectedClassName = name;
        this.selectedClassColor = color;
    }

    /** Delete annotation by index */
    deleteAnnotation(index) {
        if (index >= 0 && index < this.annotations.length) {
            this.undoStack.push([...this.annotations]);
            this.annotations.splice(index, 1);
            this.render();
            this._notifyChange();
        }
    }

    /** Undo last action */
    undo() {
        if (this.undoStack.length > 0) {
            this.annotations = this.undoStack.pop();
            this.render();
            this._notifyChange();
        }
    }

    /** Get all annotations as YOLO normalized bboxes */
    getAnnotations() {
        return this.annotations.map(a => ({
            class_id: a.classId,
            bbox: a.bbox
        }));
    }

    // ---- Internal ----

    _resize() {
        const rect = this.container.getBoundingClientRect();
        this.canvas.width = rect.width;
        this.canvas.height = rect.height;
        if (this.image) this._fitImage();
        this.render();
    }

    _fitImage() {
        if (!this.image) return;
        const cw = this.canvas.width;
        const ch = this.canvas.height;
        const iw = this.imageW;
        const ih = this.imageH;

        this.scale = Math.min(cw / iw, ch / ih) * 0.95;
        this.offsetX = (cw - iw * this.scale) / 2;
        this.offsetY = (ch - ih * this.scale) / 2;
    }

    /** Convert mouse pos to image coords (normalized 0-1) */
    _mouseToImage(mx, my) {
        const ix = (mx - this.offsetX) / this.scale;
        const iy = (my - this.offsetY) / this.scale;
        return {
            x: ix / this.imageW,
            y: iy / this.imageH
        };
    }

    /** Convert normalized bbox to canvas pixel coords */
    _bboxToCanvas(bbox) {
        const x = (bbox.x - bbox.w / 2) * this.imageW * this.scale + this.offsetX;
        const y = (bbox.y - bbox.h / 2) * this.imageH * this.scale + this.offsetY;
        const w = bbox.w * this.imageW * this.scale;
        const h = bbox.h * this.imageH * this.scale;
        return { x, y, w, h };
    }

    _bindEvents() {
        const c = this.canvas;

        c.addEventListener('mousedown', (e) => {
            const rect = c.getBoundingClientRect();
            const mx = e.clientX - rect.left;
            const my = e.clientY - rect.top;

            // Middle mouse = pan
            if (e.button === 1) {
                this.isPanning = true;
                this.panStart = { x: mx, y: my, ox: this.offsetX, oy: this.offsetY };
                e.preventDefault();
                return;
            }

            // Right click = nothing
            if (e.button === 2) return;

            // Left click: check if clicking on existing annotation
            const hit = this._hitTest(mx, my);
            if (hit >= 0) {
                this.hoveredAnnotation = hit;
                this.render();
                return;
            }

            // Start drawing
            if (this.selectedClassId === null) {
                showToast('Select a class first!', 'error');
                return;
            }

            this.isDrawing = true;
            this.drawStart = { x: mx, y: my };
            this.drawCurrent = { x: mx, y: my };
        });

        c.addEventListener('mousemove', (e) => {
            const rect = c.getBoundingClientRect();
            const mx = e.clientX - rect.left;
            const my = e.clientY - rect.top;

            if (this.isPanning) {
                this.offsetX = this.panStart.ox + (mx - this.panStart.x);
                this.offsetY = this.panStart.oy + (my - this.panStart.y);
                this.render();
                return;
            }

            if (this.isDrawing) {
                this.drawCurrent = { x: mx, y: my };
                this.render();
                return;
            }

            // Hover highlight
            const hit = this._hitTest(mx, my);
            if (hit !== this.hoveredAnnotation) {
                this.hoveredAnnotation = hit;
                this.render();
            }
        });

        c.addEventListener('mouseup', (e) => {
            if (this.isPanning) {
                this.isPanning = false;
                return;
            }

            if (this.isDrawing) {
                this.isDrawing = false;
                this._finishDrawing();
            }
        });

        c.addEventListener('wheel', (e) => {
            e.preventDefault();
            const rect = c.getBoundingClientRect();
            const mx = e.clientX - rect.left;
            const my = e.clientY - rect.top;

            const delta = e.deltaY > 0 ? 0.9 : 1.1;
            const newScale = this.scale * delta;

            // Zoom toward mouse position
            this.offsetX = mx - (mx - this.offsetX) * delta;
            this.offsetY = my - (my - this.offsetY) * delta;
            this.scale = newScale;

            this.render();
        });

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if (e.ctrlKey && e.key === 'z') {
                e.preventDefault();
                this.undo();
            }
        });

        // Prevent context menu
        c.addEventListener('contextmenu', (e) => e.preventDefault());
    }

    _hitTest(mx, my) {
        // Check if mouse is over any annotation (reverse order for top-most first)
        for (let i = this.annotations.length - 1; i >= 0; i--) {
            const r = this._bboxToCanvas(this.annotations[i].bbox);
            if (mx >= r.x && mx <= r.x + r.w && my >= r.y && my <= r.y + r.h) {
                return i;
            }
        }
        return -1;
    }

    _finishDrawing() {
        if (!this.drawStart || !this.drawCurrent) return;

        const p1 = this._mouseToImage(this.drawStart.x, this.drawStart.y);
        const p2 = this._mouseToImage(this.drawCurrent.x, this.drawCurrent.y);

        // Calculate normalized bbox (YOLO format: center_x, center_y, width, height)
        const x1 = Math.max(0, Math.min(p1.x, p2.x));
        const y1 = Math.max(0, Math.min(p1.y, p2.y));
        const x2 = Math.min(1, Math.max(p1.x, p2.x));
        const y2 = Math.min(1, Math.max(p1.y, p2.y));

        const w = x2 - x1;
        const h = y2 - y1;

        // Ignore tiny boxes (accidental clicks)
        if (w < 0.005 || h < 0.005) return;

        const bbox = {
            x: parseFloat((x1 + w / 2).toFixed(6)),
            y: parseFloat((y1 + h / 2).toFixed(6)),
            w: parseFloat(w.toFixed(6)),
            h: parseFloat(h.toFixed(6))
        };

        // Save undo state
        this.undoStack.push([...this.annotations.map(a => ({ ...a }))]);

        this.annotations.push({
            classId: this.selectedClassId,
            className: this.selectedClassName,
            color: this.selectedClassColor,
            bbox
        });

        this.render();
        this._notifyChange();
    }

    _notifyChange() {
        if (this.onAnnotationsChange) this.onAnnotationsChange(this.annotations);
    }

    /** Render everything */
    render() {
        const ctx = this.ctx;
        const cw = this.canvas.width;
        const ch = this.canvas.height;

        // Clear
        ctx.clearRect(0, 0, cw, ch);

        // Background
        ctx.fillStyle = '#f1f5f9';
        ctx.fillRect(0, 0, cw, ch);

        if (!this.image) {
            ctx.fillStyle = '#94a3b8';
            ctx.font = '14px Inter, sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('No image loaded', cw / 2, ch / 2);
            return;
        }

        // Draw image
        ctx.drawImage(
            this.image,
            this.offsetX, this.offsetY,
            this.imageW * this.scale, this.imageH * this.scale
        );

        // Draw existing annotations
        for (let i = 0; i < this.annotations.length; i++) {
            const ann = this.annotations[i];
            const r = this._bboxToCanvas(ann.bbox);
            const isHovered = i === this.hoveredAnnotation;

            // Fill
            ctx.fillStyle = ann.color + (isHovered ? '30' : '18');
            ctx.fillRect(r.x, r.y, r.w, r.h);

            // Border
            ctx.strokeStyle = ann.color;
            ctx.lineWidth = isHovered ? 3 : 2;
            ctx.strokeRect(r.x, r.y, r.w, r.h);

            // Label
            const label = ann.className || `Class ${ann.classId}`;
            ctx.font = 'bold 11px Inter, sans-serif';
            const textW = ctx.measureText(label).width + 8;
            ctx.fillStyle = ann.color;
            ctx.fillRect(r.x, r.y - 18, textW, 18);
            ctx.fillStyle = '#fff';
            ctx.fillText(label, r.x + 4, r.y - 5);
        }

        // Draw current drawing
        if (this.isDrawing && this.drawStart && this.drawCurrent) {
            const x = Math.min(this.drawStart.x, this.drawCurrent.x);
            const y = Math.min(this.drawStart.y, this.drawCurrent.y);
            const w = Math.abs(this.drawCurrent.x - this.drawStart.x);
            const h = Math.abs(this.drawCurrent.y - this.drawStart.y);

            ctx.strokeStyle = this.selectedClassColor;
            ctx.lineWidth = 2;
            ctx.setLineDash([6, 3]);
            ctx.strokeRect(x, y, w, h);
            ctx.setLineDash([]);

            ctx.fillStyle = this.selectedClassColor + '15';
            ctx.fillRect(x, y, w, h);
        }
    }
}
