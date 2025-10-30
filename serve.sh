#!/bin/bash

# Simple script to serve the built application

echo "🚀 Starting local server for GitHub Notifications Manager..."
echo ""
echo "Choose an option:"
echo "1) Use Python's built-in server (if you have Python)"
echo "2) Use Node's serve package"
echo "3) Use Vite's preview mode"
echo ""

# Check if Python is available
if command -v python3 &> /dev/null; then
    echo "To use Python (option 1), run:"
    echo "  cd dist && python3 -m http.server 8000"
    echo "  Then open: http://localhost:8000"
    echo ""
fi

# Check if npx is available
if command -v npx &> /dev/null; then
    echo "To use serve (option 2), run:"
    echo "  npx serve dist"
    echo "  Then open the URL it provides"
    echo ""
fi

# NPM scripts option
echo "To use Vite preview (option 3), run:"
echo "  npm run preview"
echo "  Then open: http://localhost:4173"
echo ""

# Default to Vite preview
echo "Running Vite preview mode..."
npm run preview
