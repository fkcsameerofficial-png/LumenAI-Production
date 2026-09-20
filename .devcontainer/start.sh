#!/usr/bin/env bash
# Starts both the backend API and the frontend dev server together, in the foreground,
# so a single terminal shows both logs. Press Ctrl+C to stop both.
set -e
cd "$(dirname "$0")/.."

cleanup() {
  echo "Stopping..."
  kill "$BACKEND_PID" "$FRONTEND_PID" 2>/dev/null || true
}
trap cleanup EXIT

(cd backend && npm run dev) &
BACKEND_PID=$!

(cd frontend && npm run dev) &
FRONTEND_PID=$!

echo "Backend: http://localhost:8787   Frontend: http://localhost:5173"
echo "In Codespaces/Gitpod, use the forwarded-port URL shown in the Ports tab instead of localhost."
wait
