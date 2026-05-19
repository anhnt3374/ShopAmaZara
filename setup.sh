#!/usr/bin/env bash
# setup.sh — first-time install + run for AmaZara.
#
# What it does (in order):
#   1. Verify docker + docker compose are present.
#   2. Create backend/.env and frontend/.env from their .env.example files.
#   3. (Optional --reset) Tear down existing containers and volumes for a fresh DB.
#   4. docker compose up -d  →  MySQL + backend (auto-installs deps, TypeORM synchronize)
#                                + frontend (auto-installs deps, Vite HMR).
#   5. Wait for backend /health to respond.
#   6. (Optional, default on) Seed: products + reviews into MySQL via the backend container.
#   7. Print URLs.
#
# Usage:
#   ./setup.sh                 # default: full setup + seed
#   ./setup.sh --no-seed       # skip the seed step
#   ./setup.sh --reset         # drop volumes first (fresh DB)
#   ./setup.sh --no-frontend   # backend + db only (skip frontend container)
#   ./setup.sh --help          # show this help

set -euo pipefail

NO_SEED=false
RESET=false
NO_FRONTEND=false

usage() {
  awk '/^# /{sub(/^# ?/,""); print; next} /^[^#]/{exit}' "$0"
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --no-seed) NO_SEED=true; shift ;;
    --reset) RESET=true; shift ;;
    --no-frontend) NO_FRONTEND=true; shift ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown flag: $1" >&2; usage; exit 1 ;;
  esac
done

# Always run from the repo root (the dir containing this script).
cd "$(dirname "$(readlink -f "$0")")"

c_green() { printf '\033[32m%s\033[0m\n' "$*"; }
c_yellow() { printf '\033[33m%s\033[0m\n' "$*"; }
c_red() { printf '\033[31m%s\033[0m\n' "$*" >&2; }
step() { printf '\n\033[1;36m▶ %s\033[0m\n' "$*"; }

# 1. Prerequisites ------------------------------------------------------------

step "Checking prerequisites"
if ! command -v docker >/dev/null 2>&1; then
  c_red "docker not found. Install Docker Desktop / Docker Engine first."
  exit 1
fi
# 'docker compose' (v2 subcommand) vs 'docker-compose' (legacy binary).
if docker compose version >/dev/null 2>&1; then
  DC="docker compose"
elif command -v docker-compose >/dev/null 2>&1; then
  DC="docker-compose"
else
  c_red "docker compose plugin not found (tried 'docker compose' and 'docker-compose')."
  exit 1
fi
c_green "docker + $DC OK"

# 2. .env files ---------------------------------------------------------------

step "Preparing .env files"
if [[ ! -f backend/.env ]]; then
  if [[ ! -f backend/.env.example ]]; then
    c_red "backend/.env.example missing — cannot bootstrap backend/.env."
    exit 1
  fi
  cp backend/.env.example backend/.env
  c_green "Created backend/.env (from .env.example)."
  c_yellow "  Set GROQ_API_KEY in backend/.env if you want the chatbot enabled."
else
  c_green "backend/.env already exists — keeping it."
fi
if [[ "$NO_FRONTEND" == "false" && ! -f frontend/.env ]]; then
  if [[ -f frontend/.env.example ]]; then
    cp frontend/.env.example frontend/.env
    c_green "Created frontend/.env."
  else
    c_yellow "frontend/.env.example missing — skipping; defaults will apply."
  fi
fi

# 3. Optional reset -----------------------------------------------------------

if [[ "$RESET" == "true" ]]; then
  step "Resetting docker volumes (--reset)"
  $DC down -v
  c_green "Volumes removed."
fi

# 4. Bring services up --------------------------------------------------------

step "Starting services"
if [[ "$NO_FRONTEND" == "true" ]]; then
  $DC up -d mysql backend
else
  $DC up -d
fi
c_green "Containers started."

# 5. Wait for backend health --------------------------------------------------

step "Waiting for backend health (up to ~2 minutes)"
HEALTH_URL="http://localhost:3000/health"
ATTEMPTS=120
for ((i = 1; i <= ATTEMPTS; i++)); do
  if curl -fsS "$HEALTH_URL" >/dev/null 2>&1; then
    c_green "Backend is healthy."
    break
  fi
  if [[ $i -eq $ATTEMPTS ]]; then
    c_red "Backend never responded on $HEALTH_URL. Last logs:"
    $DC logs --tail 60 backend >&2 || true
    exit 1
  fi
  sleep 1
done

# 6. Seed ---------------------------------------------------------------------

if [[ "$NO_SEED" == "true" ]]; then
  c_yellow "\nSkipping seed (--no-seed)."
else
  step "Seeding sample data (products + reviews)"
  if [[ ! -f products.enriched.csv ]]; then
    c_yellow "products.enriched.csv missing at repo root — products seed will be empty."
  fi
  if [[ ! -f backend/1200_sample_review.json ]]; then
    c_yellow "backend/1200_sample_review.json missing — reviews seed will be empty."
  fi
  if ! $DC exec -T backend npm run seed:all; then
    c_red "Seed failed. You can rerun manually with:"
    c_red "  $DC exec backend npm run seed:all"
    exit 1
  fi
  c_green "Seed complete."
fi

# 7. URLs ---------------------------------------------------------------------

step "Done"
c_green "Frontend:  http://localhost:5173"
c_green "Backend:   http://localhost:3000  (health: $HEALTH_URL)"
c_green "MySQL:     localhost:3306  (db: amazara, user: amazara)"
echo
echo "Tail logs:    $DC logs -f backend"
echo "Stop:         $DC down"
echo "Reset DB:     $DC down -v  (or rerun: ./setup.sh --reset)"
