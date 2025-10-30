#!/bin/bash

# GitHub Notifications Manager - Quick Deploy Script

echo "🚀 Deploying GitHub Notifications Manager to Quick..."

# Build the project
echo "📦 Building project..."
npm run build

# Deploy to Quick
echo "☁️  Deploying to Quick..."
quick deploy dist github-notifications

echo "✅ Deployment complete!"
echo "🌐 Your app is available at: https://github-notifications.quick.shopify.io"
