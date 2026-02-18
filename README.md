# Auto-Annotation Platform

An intelligent annotation platform that uses **active learning** and **few-shot learning** to minimize annotation effort while maximizing model performance.

## 🌟 Features

- **📊 Active Learning**: Intelligently selects most informative images for annotation
- **🤖 Few-Shot Learning**: Train high-quality models with minimal data (50-100 images)
- **⚡ Auto-Annotation**: Automatically annotate remaining images with trained model
- **🎨 Simple UI**: Clean Streamlit interface for easy workflow
- **📦 Export**: Export in YOLO and COCO formats
- **🐳 Docker Ready**: Full Docker Compose setup for easy deployment

## 🏗️ Architecture

**Backend** (FastAPI):
- Project management API
- Image upload and processing
- Embedding generation (CLIP)
- Active learning sample selection
- YOLOv8 training pipeline
- Auto-annotation engine
- Export to multiple formats

**Frontend** (Streamlit):
- Multi-page app with clean UI
- Project creation and management
- Image upload and class definition
- Active learning-based annotation
- Training monitoring
- Review and export

**Core Modules**:
1. Dataset Processor - Image validation and storage
2. Embedding Generator - CLIP + FAISS vector store
3. Active Learning - 3 selection strategies
4. Training Pipeline - YOLOv8 few-shot learning
5. Auto-Annotator - Batch inference
6. Export Module - YOLO/COCO formats

## 🚀 Quick Start

### Prerequisites

- Docker and Docker Compose
- (Optional) NVIDIA Docker for GPU support

### 1. Clone and Setup

```bash
cd /home/Stark/Auto_Annotation
cp .env.example .env
```

### 2. Start Services

```bash
docker-compose up -d
```

This will start:
- PostgreSQL database (port 5432)
- Redis (port 6379)
- Backend API (port 8000)
- Celery worker
- Streamlit frontend (port 8501)

### 3. Initialize Database

```bash
docker-compose exec backend python scripts/init_db.py
```

### 4. Access the Platform

- **Streamlit UI**: http://localhost:8501
- **API Docs**: http://localhost:8000/docs

## 📖 Usage Workflow

### 1. Create Project
- Go to Projects page
- Click "Create New Project"
- Enter project name and description

### 2. Upload Images
- Go to Upload page
- Define your classes (e.g., "person", "car", "dog")
- Upload image files
- Generate embeddings

### 3. Annotate Images
- Go to Annotate page
- Click "Select Next Batch" (active learning chooses best images)
- Annotate the selected images
- Repeat until you have 50-100 annotations

### 4. Train Model
- Go to Train page
- Configure epochs and batch size
- Click "Start Training"
- Wait for training to complete (10-30 minutes)

### 5. Auto-Annotate
- On Train page, click "Auto-Annotate Remaining Images"
- Model will annotate all unannotated images
- Review results on Review page

### 6. Export
- Go to Review page
- Export in YOLO or COCO format
- Use the exported dataset for production training

## 🔧 Development

### Local Development (without Docker)

1. **Backend**:

```bash
cd backend
pip install -r requirements.txt

# Set environment variables
export DATABASE_URL="postgresql://postgres:postgres@localhost:5432/auto_annotation"
export REDIS_URL="redis://localhost:6379/0"

# Run API
uvicorn api.main:app --reload

# Run Celery worker (in another terminal)
celery -A tasks.celery_app worker --loglevel=info
```

2. **Frontend**:

```bash
cd frontend
pip install -r requirements.txt

# Set backend URL
export BACKEND_URL="http://localhost:8000"

# Run Streamlit
streamlit run app.py
```

## 📁 Project Structure

```
Auto_Annotation/
├── backend/
│   ├── api/              # FastAPI routes
│   ├── core/             # 9 core modules
│   ├── db/               # Database models
│   └── tasks/            # Celery tasks
├── frontend/
│   ├── pages/            # Streamlit pages
│   └── utils/            # API client
├── data/                 # User data storage
├── models/               # Model weights
├── scripts/              # Helper scripts
└── docker-compose.yml    # Deploy stack
```

## 🎯 Key Technologies

- **Backend**: FastAPI, SQLAlchemy, PostgreSQL, Celery, Redis
- **ML/CV**: PyTorch, Ultralytics YOLOv8, CLIP, FAISS
- **Frontend**: Streamlit
- **Deployment**: Docker, Docker Compose

## 📊 Expected Results

- **Annotation Efficiency**: 80-90% reduction in manual annotation
- **Model Quality**: Comparable to full dataset with 10x less annotations
- **Time Savings**: Hours instead of days for dataset creation

## 🐛 Troubleshooting

### Backend not connecting to database
```bash
docker-compose logs postgres
docker-compose restart backend
```

### Celery tasks not running
```bash
docker-compose logs celery_worker
docker-compose restart celery_worker
```

### Frontend can't reach backend
- Check backend is running: http://localhost:8000
- Check BACKEND_URL environment variable
- Check CORS settings in backend

## 🔮 Future Enhancements

- [ ] Advanced annotation canvas with drawing tools
- [ ] Multi-user support with authentication
- [ ] Model comparison dashboard
- [ ] Segmentation support (not just detection)
- [ ] Active learning with uncertainty sampling
- [ ] Integration with cloud storage (S3, GCS)
- [ ] Kubernetes deployment templates

## 📝 License

MIT License

## 🤝 Contributing

Contributions welcome! Please feel free to submit issues and pull requests.

## 📧 Support

For questions and support, please open an issue on the repository.

---

**Built with ❤️ using Python, FastAPI, Streamlit, and YOLOv8**
