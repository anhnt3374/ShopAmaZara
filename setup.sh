#!/usr/bin/env bash
# setup.sh — first-time install + run for AmaZara.
#
# What it does (in order):
#   1. Verify docker + docker compose are present.
#   2. Create backend/.env and frontend/.env from their .env.example files.
#   3. (Optional --reset) Tear down existing containers AND volumes for a fresh start.
#   4. docker compose up -d  →  MySQL + Qdrant + backend (auto-installs deps, TypeORM
#                                synchronize) + frontend (Vite HMR) + embedding services.
#   5. Wait for backend /health to respond.
#   6. (Optional, default on) Seed: products + reviews into MySQL via the backend container.
#   7. (Optional, default on) Wait for the embedding services, then index products into
#      Qdrant (semantic search). Needs a GPU; skipped gracefully if they never become ready.
#   8. Print URLs.
#
# Note: the chatbot needs GROQ_API_KEY in backend/.env (not set automatically).
#
# Usage:
#   ./setup.sh                 # default: full setup + seed + index
#   ./setup.sh --no-seed       # skip the MySQL seed step
#   ./setup.sh --no-index      # skip the Qdrant product indexing step
#   ./setup.sh --reset         # tear down old containers + volumes first (fresh start)
#   ./setup.sh --no-frontend   # backend + db only (skip frontend container)
#   ./setup.sh --help          # show this help

set -euo pipefail

NO_SEED=false
NO_INDEX=false
RESET=false
NO_FRONTEND=false

usage() {
  awk '/^# /{sub(/^# ?/,""); print; next} /^[^#]/{exit}' "$0"
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --no-seed) NO_SEED=true; shift ;;
    --no-index) NO_INDEX=true; shift ;;
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
  step "Tearing down old containers + volumes (--reset)"
  # -v drops named volumes (MySQL data, Qdrant storage, hf_cache, node_modules);
  # --remove-orphans clears containers no longer in the compose file.
  $DC down -v --remove-orphans
  c_green "Old stack removed (containers + volumes)."
fi

# 4. Bring services up --------------------------------------------------------

step "Starting services"
if [[ "$NO_FRONTEND" == "true" ]]; then
  $DC up -d --remove-orphans mysql qdrant backend
else
  $DC up -d --remove-orphans
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

# 7. Index products into Qdrant (semantic search) -----------------------------
# Needs the embedding services ready (GPU). The models load lazily on the first
# request (so /health reports model_loaded:false until then) and download on the
# first run, so we force + await the load via /info and skip rather than fail.

# Hit /info, which forces the lazy model load and returns {model,dim,device}.
# Each call may block while the model loads/downloads. Args: url name.
wait_embed() {
  local url="$1" name="$2" tries=30   # ~30 attempts; each /info waits up to 5 min
  for ((j = 1; j <= tries; j++)); do
    if curl -fsS --max-time 300 "$url/info" 2>/dev/null | grep -q '"dim"'; then
      c_green "  $name ready (model loaded)."
      return 0
    fi
    printf '    …loading %s model (attempt %d; first run downloads weights)\n' "$name" "$j"
    sleep 5
  done
  return 1
}

if [[ "$NO_INDEX" == "true" ]]; then
  c_yellow "\nSkipping Qdrant indexing (--no-index)."
elif [[ "$NO_FRONTEND" == "true" ]]; then
  c_yellow "\nSkipping Qdrant indexing (embedding services not started under --no-frontend)."
  c_yellow "  Run later with: $DC up -d text-embed image-embed && $DC exec backend npm run index:products"
else
  step "Indexing products into Qdrant (semantic search)"
  if wait_embed "http://localhost:8001" "text-embed" && wait_embed "http://localhost:8002" "image-embed"; then
    if ! $DC exec -T backend npm run index:products; then
      c_red "Indexing failed. Rerun manually once services are up:"
      c_red "  $DC exec backend npm run index:products"
    else
      c_green "Product index built."
    fi
  else
    c_yellow "Embedding services never reported model_loaded (no GPU? still downloading?)."
    c_yellow "  Skipping index. Search will fall back to keyword (LIKE) matching."
    c_yellow "  Build the index later with:"
    c_yellow "    $DC logs -f text-embed image-embed   # wait until the model loads"
    c_yellow "    $DC exec backend npm run index:products"
  fi
fi

# 8. URLs ---------------------------------------------------------------------

step "Done"
c_green "Frontend:  http://localhost:5173"
c_green "Backend:   http://localhost:3000  (health: $HEALTH_URL)"
c_green "MySQL:     localhost:3306  (db: amazara, user: amazara)"
c_green "Qdrant:    http://localhost:6333"
echo
c_yellow "Chatbot is off until you set GROQ_API_KEY in backend/.env, then: $DC restart backend"
echo
echo "Tail logs:    $DC logs -f backend"
echo "Stop:         $DC down"
echo "Fresh start:  $DC down -v --remove-orphans   (or rerun: ./setup.sh --reset)"
echo "Reindex:      $DC exec backend npm run index:products"
