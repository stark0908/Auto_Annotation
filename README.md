# Auto-Annotation Platform

An intelligent annotation platform that uses **active learning** and **few-shot learning** to minimize manual annotation effort while maximizing model performance. Annotate a small subset of images, train a model, and let it auto-annotate the rest.

---

## Features

- **Active Learning** — Intelligently selects the most informative images for annotation
- **Few-Shot Training** — Train high-quality YOLOv8 models with minimal data (50-100 images)
- **Auto-Annotation** — Automatically annotate remaining images using the trained model
- **Canvas Annotation** — Draw bounding boxes directly in the browser with keyboard shortcuts
- **Embedding-Based Selection** — CLIP embeddings + FAISS for smart sample selection
- **Export** — Export annotations in YOLO and COCO formats
- **Docker Ready** — Full Docker Compose setup for single-command deployment

---

## Architecture

```
                  +-------------+
                  |  PostgreSQL |
                  +------+------+
                         |
+--------+        +------+------+        +--------+
| Browser | <---> |   Backend   | <----> | Redis  |
|  (SPA)  |       |  (FastAPI)  |        +---+----+
+--------+        +------+------+            |
                         |              +----+-------+
                         +--------------| Celery     |
                                        | Worker     |
                                        +------------+
```

| Component | Role |
|-----------|------|
| **Backend (FastAPI)** | REST API, static frontend serving, project management |
| **Celery Worker** | Background tasks: embedding generation, training, auto-annotation |
| **PostgreSQL** | Persistent storage for projects, images, annotations, classes |
| **Redis** | Celery message broker |
| **Frontend (Vanilla JS)** | Single-page application served by the backend |

### Core Modules

| Module | Description |
|--------|-------------|
| Dataset Processor | Image validation, resizing, and organized storage |
| Embedding Generator | CLIP feature extraction + FAISS vector indexing |
| Active Learning | 3 selection strategies (max distance, clustering, random) |
| Training Pipeline | YOLOv8 few-shot fine-tuning via Ultralytics |
| Auto-Annotator | Batch inference on unannotated images |
| Export Module | YOLO and COCO format generation |

---

## Quick Start

### Prerequisites

- Docker and Docker Compose
- (Optional) NVIDIA Container Toolkit for GPU acceleration

### 1. Clone and Configure

```bash
git clone <repository-url>
cd Auto_Annotation
cp .env.example .env
```

Edit `.env` if needed (defaults work out of the box).

### 2. Start Services

```bash
docker compose up -d
```

This starts 4 containers:

| Service | Port | Description |
|---------|------|-------------|
| `postgres` | 5432 | Database |
| `redis` | 6379 | Task broker |
| `backend` | **8000** | API + Frontend |
| `celery_worker` | — | Background tasks |

### 3. Initialize Database

```bash
docker compose exec backend python scripts/init_db.py
```

### 4. Open the Platform

Navigate to **http://localhost:8000** in your browser.

API documentation is available at **http://localhost:8000/docs**.

---

## Usage Workflow

### Step 1: Create a Project

- Open the **Projects** page
- Click **"+ New Project"**
- Enter a name and optional description

### Step 2: Upload Images and Define Classes

- Navigate to the **Upload** page
- Define annotation classes (e.g., "car", "person", "truck") with colors
- Drag and drop images or click to upload
- Click **"Generate Embeddings"** to compute CLIP features for active learning

### Step 3: Annotate Images

- Go to the **Annotate** page
- Click **"Get Next Batch"** to let active learning select the most informative images
- Draw bounding boxes on images using click-and-drag
- Select classes via the sidebar or keyboard shortcuts (1-9)
- Click **"Save"** to persist annotations
- Repeat until you have 50-100 annotated images

### Step 4: Train the Model

- Navigate to the **Train** page
- Check **Training Readiness** (annotated images count, classes)
- Configure epochs (default: 50) and batch size (default: 16)
- Click **"Start Training"**
- Monitor progress in the terminal-style log panel

### Step 5: Auto-Annotate Remaining Images

- On the **Train** page, set a confidence threshold
- Click **"Auto-Annotate Remaining"**
- The trained model will annotate all unannotated images

### Step 6: Review and Export

- Go to the **Review** page
- Inspect dataset statistics and preview annotated images
- Export in **YOLO** or **COCO** format for production training

---

## Project Structure

```
Auto_Annotation/
├── backend/
│   ├── api/                  # FastAPI application
│   │   ├── main.py           # App entry point, static file serving
│   │   ├── routes/           # API route handlers
│   │   └── schemas.py        # Pydantic request/response models
│   ├── core/                 # Core ML modules
│   │   ├── active_learning.py
│   │   ├── auto_annotator.py
│   │   ├── dataset_processor.py
│   │   ├── embedding_generator.py
│   │   ├── export_manager.py
│   │   └── training_pipeline.py
│   ├── db/                   # Database layer
│   │   ├── models.py         # SQLAlchemy models
│   │   ├── crud.py           # Database operations
│   │   └── database.py       # Connection setup
│   ├── tasks/                # Celery background tasks
│   ├── Dockerfile
│   └── requirements.txt
├── frontend/
│   └── static/               # Vanilla JS single-page application
│       ├── index.html        # SPA shell
│       ├── css/style.css     # Light minimal theme
│       └── js/
│           ├── app.js        # Router and global state
│           ├── api.js        # Backend API client
│           ├── components/   # Canvas, task tracker
│           └── pages/        # Page modules (projects, upload, annotate, train, review)
├── data/                     # Uploaded images and datasets (volume-mounted)
├── models/                   # Trained model weights
├── scripts/                  # Database initialization
├── docker-compose.yml
├── .env.example
└── start.sh
```

---

## Technology Stack

| Category | Technologies |
|----------|-------------|
| **Backend** | Python 3.11, FastAPI, SQLAlchemy, PostgreSQL, Celery, Redis |
| **ML / CV** | PyTorch, Ultralytics YOLOv8, OpenAI CLIP, FAISS |
| **Frontend** | Vanilla JavaScript, HTML5 Canvas, CSS |
| **Deployment** | Docker, Docker Compose |

---

## Development

### Running Without Docker

**Backend:**

```bash
cd backend
pip install -r requirements.txt

export DATABASE_URL="postgresql://postgres:postgres@localhost:5432/auto_annotation"
export REDIS_URL="redis://localhost:6379/0"

# Start API server
uvicorn api.main:app --reload --host 0.0.0.0 --port 8000

# Start Celery worker (separate terminal)
celery -A tasks.celery_app worker --loglevel=info
```

**Database:**

```bash
# Start PostgreSQL and Redis locally, then initialize
python scripts/init_db.py
```

The frontend is served automatically by FastAPI from `frontend/static/`.

### Common Docker Commands

```bash
# Start all services
docker compose up -d

# Stop all services
docker compose down

# Restart backend after code changes
docker compose restart backend celery_worker

# View logs
docker compose logs -f backend
docker compose logs -f celery_worker

# Rebuild after Dockerfile or dependency changes
docker compose up -d --build
```

---

## Troubleshooting

**Backend not connecting to database:**

```bash
docker compose logs postgres
docker compose restart backend
```

**Celery tasks not running:**

```bash
docker compose logs celery_worker
docker compose restart celery_worker
```

**Training Readiness shows 0 annotated images:**

Make sure you click **"Save"** on the Annotate page after drawing bounding boxes. Annotations are only persisted when explicitly saved.

**Embeddings not generating:**

Check that the Celery worker is running and has network access to download the CLIP model on first use.

---

## Expected Results

| Metric | Typical Value |
|--------|--------------|
| Annotation reduction | 80-90% fewer manual annotations needed |
| Model quality | Comparable to full-dataset training with 10x fewer labels |
| Time savings | Hours instead of days for dataset creation |

---

## Future Enhancements

- [ ] GPU support for training and inference
- [ ] Multi-user support with authentication
- [ ] Polygon and segmentation annotation tools
- [ ] Model comparison dashboard
- [ ] Uncertainty sampling strategy
- [ ] Cloud storage integration (S3, GCS)
- [ ] Kubernetes deployment manifests

---

## License

MIT License

---

## Contributing

Contributions are welcome. Please open an issue to discuss proposed changes before submitting a pull request.

---

Built with Python, FastAPI, YOLOv8, and CLIP.
