#!/bin/bash
set -e

echo "╔═══════════════════════════════════════════════════════════════╗"
echo "║      TypeScript Code Structure Visualizer - Starting          ║"
echo "╚═══════════════════════════════════════════════════════════════╝"
echo ""

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

BACKEND_PID=""
FRONTEND_PID=""

# Cleanup function - registered early to handle Ctrl+C during startup
cleanup() {
  echo ""
  echo "Shutting down services..."
  [ -n "$BACKEND_PID" ] && kill "$BACKEND_PID" 2>/dev/null || true
  [ -n "$FRONTEND_PID" ] && kill "$FRONTEND_PID" 2>/dev/null || true
  exit 0
}

trap cleanup SIGINT SIGTERM

# Kill any existing instances by process name (scoped to this project)
echo "Cleaning up existing processes..."
pkill -9 -f "deno.*${SCRIPT_DIR}/backend/src/server/server.ts" 2>/dev/null || true
pkill -9 -f "next dev.*${SCRIPT_DIR}/frontend" 2>/dev/null || true
sleep 1

# Kill processes by port (more reliable)
echo "Checking and killing processes on ports 8000 and 3001..."
for port in 8000 3001; do
  pid=$(ss -tlnp 2>/dev/null | grep ":$port " | grep -oP 'pid=\K[0-9]+' | head -1)
  if [ -n "$pid" ]; then
    echo "  Killing process $pid on port $port..."
    kill -9 $pid 2>/dev/null || true
  fi
done

# Wait for ports to be freed
echo "Waiting for ports to be freed..."
for i in {1..10}; do
  if ! ss -tlnp 2>/dev/null | grep -q ":3001 " && ! ss -tlnp 2>/dev/null | grep -q ":8000 "; then
    echo "Ports are free!"
    break
  fi
  sleep 1
done

# Final check
if ss -tlnp 2>/dev/null | grep -q ":3001 "; then
  echo "⚠️  ERROR: Port 3001 is still in use!"
  ss -tlnp | grep ":3001 "
  echo "Please run: kill -9 $(ss -tlnp | grep ':3001 ' | grep -oP 'pid=\K[0-9]+' | head -1)"
  exit 1
fi
if ss -tlnp 2>/dev/null | grep -q ":8000 "; then
  echo "⚠️  ERROR: Port 8000 is still in use!"
  ss -tlnp | grep ":8000 "
  echo "Please run: kill -9 $(ss -tlnp | grep ':8000 ' | grep -oP 'pid=\K[0-9]+' | head -1)"
  exit 1
fi

sleep 1

# Check Podman + sandbox image
if ! command -v podman &>/dev/null; then
  echo "WARNING: Podman not found. Sandbox tab will not work."
else
  if ! podman image exists sandbox-bun 2>/dev/null; then
    echo "Building sandbox container image..."
    podman build -t sandbox-bun ./sandbox || echo "WARNING: Failed to build sandbox image. Sandbox tab may not work."
  else
    echo "Sandbox image already exists."
  fi
fi

echo "Installing frontend dependencies..."
cd frontend
npm install || { echo "npm install failed"; exit 1; }

echo ""
echo "Starting API server (backend)..."
cd ..
set +e
deno run --allow-read --allow-write --allow-net --allow-env --allow-run backend/src/server/server.ts &
BACKEND_PID=$!

sleep 3

echo ""
echo "Starting frontend development server..."
cd frontend
npm run dev -- -H localhost &
FRONTEND_PID=$!

sleep 5

echo ""
echo "╔═══════════════════════════════════════════════════════════════╗"
echo "║  Services Started:                                            ║"
echo "║    - Backend API:  http://localhost:8000                      ║"
echo "║    - Frontend:    http://localhost:3001                       ║"
echo "╚═══════════════════════════════════════════════════════════════╝"
echo ""
echo "Press Ctrl+C to stop all services"

wait
