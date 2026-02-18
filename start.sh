#!/bin/bash
# Quick start script - launches the entire platform

echo "🚀 Starting Auto-Annotation Platform..."
echo ""

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo "❌ Docker is not running. Please start Docker first."
    exit 1
fi

# Check if .env exists
if [ ! -f .env ]; then
    echo "📝 Creating .env file from template..."
    cp .env.example .env
fi

# Build and start services
echo "🔨 Building Docker images..."
docker-compose build

echo ""
echo "🚢 Starting services..."
docker-compose up -d

# Wait for services to be ready
echo ""
echo "⏳ Waiting for services to be ready..."
sleep 10

# Initialize database
echo ""
echo "💾 Initializing database..."
docker-compose exec -T backend python scripts/init_db.py

echo ""
echo "✅ Platform is ready!"
echo ""
echo "🌐 Access the platform:"
echo "   - Frontend: http://localhost:8501"
echo "   - API Docs: http://localhost:8000/docs"
echo ""
echo "📊 Check service status:"
echo "   docker-compose ps"
echo ""
echo "📜 View logs:"
echo "   docker-compose logs -f"
echo ""
echo "🛑 Stop the platform:"
echo "   docker-compose down"
echo ""
