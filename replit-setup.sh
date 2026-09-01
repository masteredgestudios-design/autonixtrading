#!/bin/bash
set -e

echo "========================================="
echo "Installing dependencies..."
echo "========================================="

# Install Python dependencies
echo "Installing Python packages..."
pip install --upgrade pip setuptools wheel
pip install -r requirements.txt gunicorn

# Install Node dependencies
echo "Installing Node packages..."
npm install --legacy-peer-deps

# Build React app
echo "Building React application..."
npm run build

echo "========================================="
echo "Setup complete! Ready to start."
echo "========================================="
