#!/bin/bash
# Render deployment script for GreenishMart backend

set -e

echo "🚀 Starting production build for GreenishMart..."

# Navigate to django_backend
cd django_backend

# Install dependencies
echo "📦 Installing dependencies..."
pip install --upgrade pip
pip install -r requirements.txt

# Collect static files
echo "📚 Collecting static files..."
python manage.py collectstatic --noinput

# Run migrations
echo "🗄️  Running database migrations..."
python manage.py migrate

echo "✅ Build completed successfully!"
echo "🔥 Ready for gunicorn startup"
