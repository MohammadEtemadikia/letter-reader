#!/usr/bin/env bash
# Letter Reader — one-command start for macOS and Linux.
# Installs dependencies and builds on first run, then starts the app.
set -euo pipefail

cd "$(dirname "$0")"
PORT="${PORT:-3400}"
URL="http://localhost:${PORT}"

say()  { printf '\033[1;34m==>\033[0m %s\n' "$1"; }
warn() { printf '\033[1;33m!  \033[0m %s\n' "$1"; }
die()  { printf '\033[1;31mX  \033[0m %s\n' "$1" >&2; exit 1; }

# --- Node -------------------------------------------------------------------
command -v node >/dev/null 2>&1 || die \
  "Node.js is not installed. Install Node 20 or newer from https://nodejs.org and run this again."

NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
if [ "$NODE_MAJOR" -lt 20 ]; then
  die "Node $(node -v) is too old. Version 20 or newer is required."
fi
say "Node $(node -v)"

# --- Claude Code ------------------------------------------------------------
# Not fatal: the app shows an in-page setup panel with the exact fix.
if ! command -v claude >/dev/null 2>&1; then
  warn "Claude Code is not installed. Install it, then sign in:"
  warn "    npm install -g @anthropic-ai/claude-code"
  warn "    claude auth login"
elif ! claude auth status >/dev/null 2>&1; then
  warn "Claude Code is installed but not signed in. Run:  claude auth login"
else
  say "Claude Code ready"
fi

# --- Dependencies and build -------------------------------------------------
if [ ! -d node_modules ]; then
  say "Installing dependencies (first run only, a minute or two)…"
  npm install --no-audit --no-fund
fi

if [ ! -d .next ]; then
  say "Building…"
  npm run build
fi

# --- Start ------------------------------------------------------------------
say "Starting mobile-upload server on port 8934"
node scripts/upload-server-standalone.cjs &
UPLOAD_PID=$!

say "Starting on ${URL}"
npx next start -p "$PORT" &
SERVER_PID=$!
trap 'kill $SERVER_PID $UPLOAD_PID 2>/dev/null || true' EXIT INT TERM

for _ in $(seq 1 60); do
  if curl -sf "$URL" -o /dev/null 2>/dev/null; then
    say "Opening browser"
    if command -v open >/dev/null 2>&1; then open "$URL"
    elif command -v xdg-open >/dev/null 2>&1; then xdg-open "$URL" >/dev/null 2>&1
    fi
    break
  fi
  sleep 1
done

say "Running. Press Ctrl+C to stop."
wait $SERVER_PID
