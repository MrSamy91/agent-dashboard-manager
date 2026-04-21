#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════
# Agent Dashboard — Setup Script
# Checks prerequisites, configures .env, and launches the server.
#
# Usage:
#   ./setup.sh            Local dev mode (pnpm dev)
#   ./setup.sh --docker   Build and run via Docker
#   ./setup.sh --mock     Force mock mode (no API needed)
# ═══════════════════════════════════════════════════════════

set -euo pipefail

# ─── Colors ───────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
DIM='\033[2m'
RESET='\033[0m'

ok()   { printf "  ${GREEN}✓${RESET} %s\n" "$1"; }
warn() { printf "  ${YELLOW}!${RESET} %s\n" "$1"; }
fail() { printf "  ${RED}✗${RESET} %s\n" "$1"; }
info() { printf "  ${DIM}→${RESET} %s\n" "$1"; }

# ─── Banner ───────────────────────────────────────────────
echo ""
printf "${CYAN}${BOLD}"
cat << 'EOF'
    ╔═══════════════════════════════════╗
    ║        Agent  Dashboard           ║
    ║   Claude Code  ×  Multi-Panel     ║
    ╚═══════════════════════════════════╝
EOF
printf "${RESET}\n"

# ─── Parse args ───────────────────────────────────────────
MODE="local"
FORCE_MOCK=false

for arg in "$@"; do
  case "$arg" in
    --docker) MODE="docker" ;;
    --mock)   FORCE_MOCK=true ;;
    --help|-h)
      echo "Usage: ./setup.sh [--docker] [--mock]"
      echo ""
      echo "  --docker   Build and run via Docker Compose"
      echo "  --mock     Force mock mode (no Claude API needed)"
      echo ""
      exit 0
      ;;
  esac
done

ERRORS=0

# ─── Docker mode ──────────────────────────────────────────
if [ "$MODE" = "docker" ]; then
  printf "${BOLD}Checking Docker prerequisites...${RESET}\n\n"

  # Check Docker
  if command -v docker &>/dev/null; then
    DOCKER_VERSION=$(docker --version 2>/dev/null | grep -oP '\d+\.\d+\.\d+' | head -1)
    ok "Docker ${DOCKER_VERSION}"
  else
    fail "Docker not found"
    info "Install: https://docs.docker.com/get-docker/"
    ERRORS=$((ERRORS + 1))
  fi

  # Check Docker Compose
  if docker compose version &>/dev/null; then
    COMPOSE_VERSION=$(docker compose version --short 2>/dev/null)
    ok "Docker Compose ${COMPOSE_VERSION}"
  else
    fail "Docker Compose not found"
    info "Included with Docker Desktop, or install the plugin"
    ERRORS=$((ERRORS + 1))
  fi

  if [ "$ERRORS" -gt 0 ]; then
    echo ""
    fail "Missing ${ERRORS} prerequisite(s). Fix the issues above and retry."
    exit 1
  fi

  # Ensure .env exists
  if [ ! -f .env ]; then
    cp .env.example .env
    ok "Created .env from .env.example"
  else
    ok ".env exists"
  fi

  # Force mock if requested
  if [ "$FORCE_MOCK" = true ]; then
    sed -i.bak 's/^AGENT_MODE=.*/AGENT_MODE=mock/' .env && rm -f .env.bak
    ok "Forced AGENT_MODE=mock"
  fi

  echo ""
  printf "${BOLD}Building and starting containers...${RESET}\n\n"
  docker compose up --build
  exit 0
fi

# ─── Local mode: check prerequisites ─────────────────────
printf "${BOLD}Checking prerequisites...${RESET}\n\n"

# 1. Node.js >= 22
if command -v node &>/dev/null; then
  NODE_VERSION=$(node -v | sed 's/^v//')
  NODE_MAJOR=$(echo "$NODE_VERSION" | cut -d. -f1)
  if [ "$NODE_MAJOR" -ge 22 ]; then
    ok "Node.js ${NODE_VERSION}"
  else
    fail "Node.js ${NODE_VERSION} — need >= 22"
    info "Install: https://nodejs.org/"
    ERRORS=$((ERRORS + 1))
  fi
else
  fail "Node.js not found"
  info "Install: https://nodejs.org/ (version 22+)"
  ERRORS=$((ERRORS + 1))
fi

# 2. pnpm
if command -v pnpm &>/dev/null; then
  PNPM_VERSION=$(pnpm --version 2>/dev/null)
  ok "pnpm ${PNPM_VERSION}"
else
  warn "pnpm not found — installing..."
  if command -v npm &>/dev/null; then
    npm install -g pnpm
    ok "pnpm installed"
  else
    fail "Cannot install pnpm (npm not found)"
    info "Install manually: npm install -g pnpm"
    ERRORS=$((ERRORS + 1))
  fi
fi

# 3. Claude Code CLI (native binary)
if command -v claude &>/dev/null; then
  CLAUDE_VERSION=$(claude --version 2>/dev/null | head -1)
  ok "Claude Code CLI ${CLAUDE_VERSION}"
else
  warn "Claude Code CLI not found"
  # Detect OS for install command
  case "$(uname -s)" in
    Darwin|Linux)
      info "Install: curl -fsSL https://claude.ai/install.sh | bash"
      ;;
    MINGW*|MSYS*|CYGWIN*)
      info "Install (PowerShell): irm https://claude.ai/install.ps1 | iex"
      ;;
    *)
      info "Install: https://docs.anthropic.com/en/docs/claude-code/setup"
      ;;
  esac
  info "Mock mode will still work without it"
fi

# 4. Claude auth status
if command -v claude &>/dev/null; then
  if claude auth status &>/dev/null; then
    ok "Claude authenticated"
  else
    warn "Claude not authenticated"
    info "Run: claude login"
    info "Mock mode will still work without auth"
  fi
fi

# ─── Check for critical errors ────────────────────────────
if [ "$ERRORS" -gt 0 ]; then
  echo ""
  fail "Missing ${ERRORS} critical prerequisite(s). Fix the issues above and retry."
  exit 1
fi

# ─── Setup .env ───────────────────────────────────────────
echo ""
printf "${BOLD}Configuring environment...${RESET}\n\n"

if [ ! -f .env ]; then
  cp .env.example .env
  ok "Created .env from .env.example"
else
  ok ".env already exists"
fi

# Force mock if requested
if [ "$FORCE_MOCK" = true ]; then
  sed -i.bak 's/^AGENT_MODE=.*/AGENT_MODE=mock/' .env && rm -f .env.bak
  ok "Forced AGENT_MODE=mock"
fi

# ─── Install dependencies ────────────────────────────────
echo ""
printf "${BOLD}Installing dependencies...${RESET}\n\n"
pnpm install

# ─── Launch ──────────────────────────────────────────────
echo ""
printf "${GREEN}${BOLD}Ready!${RESET} Starting dev server...\n"
printf "${DIM}Open http://localhost:3000 in your browser${RESET}\n\n"

pnpm dev
