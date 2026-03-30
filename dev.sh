#!/bin/bash
# Start/stop the Visit Sark dev environment
# Usage: ./dev.sh [start|stop]

PIDS_FILE="/tmp/visit-sark-dev.pids"
ROOT="$(cd "$(dirname "$0")" && pwd)"

start() {
  if [ -f "$PIDS_FILE" ]; then
    echo "Already running. Use './dev.sh stop' first."
    exit 1
  fi

  echo "Starting Visit Sark dev..."

  # Start static file server
  npx serve "$ROOT" --listen 3000 &> /tmp/visit-sark-serve.log &
  SERVE_PID=$!

  # Start Cloudflare Worker
  (cd "$ROOT/worker" && npx wrangler dev --port 8787) &> /tmp/visit-sark-worker.log &
  WORKER_PID=$!

  echo "$SERVE_PID $WORKER_PID" > "$PIDS_FILE"

  echo "  Static site → http://localhost:3000"
  echo "  Worker      → http://localhost:8787"
  echo ""
  echo "Logs: /tmp/visit-sark-serve.log"
  echo "      /tmp/visit-sark-worker.log"
  echo ""
  echo "Stop with: ./dev.sh stop"
}

stop() {
  if [ ! -f "$PIDS_FILE" ]; then
    echo "Not running."
    exit 0
  fi

  read SERVE_PID WORKER_PID < "$PIDS_FILE"

  echo "Stopping Visit Sark dev..."
  kill "$SERVE_PID" "$WORKER_PID" 2>/dev/null
  # Kill any stray wrangler/workerd processes
  pkill -f "wrangler dev" 2>/dev/null
  pkill -f "workerd serve" 2>/dev/null
  rm "$PIDS_FILE"
  echo "Done."
}

help() {
  echo ""
  echo "  Visit Sark — Dev Environment"
  echo ""
  echo "  Usage: ./dev.sh <command>"
  echo ""
  echo "  Commands:"
  echo "    start      Start the static site and worker (default)"
  echo "    stop       Stop both servers"
  echo "    restart    Stop then start"
  echo ""
  echo "  URLs:"
  echo "    Static site → http://localhost:3000"
  echo "    Worker API  → http://localhost:8787"
  echo ""
  echo "  Logs:"
  echo "    /tmp/visit-sark-serve.log"
  echo "    /tmp/visit-sark-worker.log"
  echo ""
}

case "$1" in
  start)   start ;;
  stop)    stop ;;
  restart) stop; sleep 1; start ;;
  "")      help ;;
  *)       echo "Unknown command: $1"; help; exit 1 ;;
esac
