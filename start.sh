#!/bin/bash

echo "╔═══════════════════════════════════════════════════════════════╗"
echo "║      TypeScript Code Structure Visualizer - Starting          ║"
echo "╚═══════════════════════════════════════════════════════════════╝"
echo ""

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "Installing frontend dependencies..."
cd frontend
npm install

echo ""
echo "Starting API server (backend)..."
cd ..
deno run --allow-read --allow-net --allow-env backend/src/cli.ts &
BACKEND_PID=$!

sleep 3

echo ""
echo "Starting frontend development server..."
cd frontend
npm run dev -- -H localhost &
FRONTEND_PID=$!

sleep 3

echo ""
echo "╔═══════════════════════════════════════════════════════════════╗"
echo "║  Services Started:                                            ║"
echo "║    - Backend API:  http://localhost:8000                      ║"
echo "║    - Frontend:    http://localhost:3001                       ║"
echo "╚═══════════════════════════════════════════════════════════════╝"
echo ""
echo "Press Ctrl+C to stop all services"

trap "kill $BACKEND_PID $FRONTEND_PID 2>/dev/null" EXIT

wait
