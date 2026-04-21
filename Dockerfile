# ═══════════════════════════════════════════════════════════
# Agent Dashboard — Multi-stage Docker build
# ═══════════════════════════════════════════════════════════

# ─── Stage 1: Build ───────────────────────────────────────
FROM node:22-slim AS build

# Enable pnpm via corepack (built into Node 22)
RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

# Install dependencies first (layer caching)
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

# Copy source and build
COPY . .
RUN pnpm build

# ─── Stage 2: Production ─────────────────────────────────
FROM node:22-slim

# Install curl for Claude Code native installer
RUN apt-get update && apt-get install -y --no-install-recommends curl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Install Claude Code CLI natively (not via npm)
# The binary lands in ~/.local/bin/claude
RUN curl -fsSL https://claude.ai/install.sh | bash
ENV PATH="/root/.local/bin:${PATH}"

# Enable pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

# Copy built app from build stage
COPY --from=build /app/.next ./.next
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./
COPY --from=build /app/public ./public

# The orchestrator reads/writes these at runtime (mounted or auto-created)
# settings.json and folders.json are created automatically if absent

EXPOSE 3000

# Default to mock mode — override with AGENT_MODE=real in .env
ENV AGENT_MODE=mock
ENV NODE_ENV=production

CMD ["pnpm", "start"]
