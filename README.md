# Agent Dashboard

One dashboard to rule all your Claude Code agents.

Replace multiple terminal windows with a single visual interface to spawn, monitor, group, and resume Claude Code agents in real time.

## Features

- **Multi-panel layout** — 1, 2, or 4 agents side by side (like Windows Snap)
- **Folder organization** — group agents by project with status pills
- **Drag & drop** — move agents between panels and folders
- **Session resume** — pick up existing Claude Code sessions from `~/.claude/`
- **Real-time streaming** — live output via Server-Sent Events
- **Directory browser** — navigate your filesystem to pick working directories
- **Toast notifications** — gooey-toast alerts for agent lifecycle events
- **Mock mode** — full UI testing without any API key or subscription
- **Settings page** — configure defaults (model, permissions, polling, etc.)

## Quick Start

### Local (recommended)

```bash
git clone <repo-url> agent-dashboard
cd agent-dashboard
pnpm install
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

### Docker

```bash
./setup.sh --docker
```

### One-liner with prereq check

```bash
./setup.sh
```

The setup script checks all prerequisites, tells you what's missing, and launches the server.

## Prerequisites

| Requirement | Version | Install |
|-------------|---------|---------|
| **Node.js** | >= 22 | [nodejs.org](https://nodejs.org/) |
| **pnpm** | latest | `npm install -g pnpm` |
| **Claude Code CLI** | latest | See below |
| **Auth** | Pro / Max / Team / Enterprise | `claude login` |

### Installing Claude Code CLI

Claude Code is installed as a **native binary** (not via npm).

**macOS / Linux:**
```bash
curl -fsSL https://claude.ai/install.sh | bash
```

**Windows (PowerShell):**
```powershell
irm https://claude.ai/install.ps1 | iex
```

After installing, authenticate:
```bash
claude login
```

This opens your browser for OAuth. You need a Pro, Max, Team, Enterprise, or Console account.

## Configuration

### Environment variables

Copy the example and edit:

```bash
cp .env.example .env
```

| Variable | Default | Description |
|----------|---------|-------------|
| `AGENT_MODE` | `mock` | `mock` = simulated agents (no API) / `real` = real Claude Code agents |
| `PROJECTS_DIR` | `.` | (Docker only) Host path mounted as `/workspace` in container |
| `CLAUDE_HOME` | `~/.claude` | (Docker only) Host path to Claude config directory |

### Settings page

Visit [http://localhost:3000/settings](http://localhost:3000/settings) to configure:
- Default model (Opus, Sonnet, Haiku)
- Default permission mode
- Default working directory
- Polling interval
- Terminal font size

## Architecture

```
Browser (React 19)
  |
  v
Next.js 15 (App Router, Turbopack)
  ├── Server Components ─── SSR pre-fetch (agents + folders)
  ├── API Routes ─────────── GET/POST/PATCH/DELETE /api/agents
  ├── Server Actions ─────── Folder CRUD (no HTTP hop)
  └── SSE Streaming ──────── /api/agents/:id/stream
        |
        v
AgentOrchestrator (singleton on globalThis)
  ├── agents: Map<id, AgentState>     (in-memory)
  ├── folders: Map<id, Folder>        (persisted to folders.json)
  └── subscribers: Map<id, Set<cb>>   (pub/sub for SSE)
        |
        v
@anthropic-ai/claude-agent-sdk
  └── query() → spawns Claude Code as subprocess
        |
        v
Claude Code CLI (native binary)
  └── Anthropic API (claude.ai)
```

## Mock Mode

Start in mock mode to explore the UI without any API key:

```bash
AGENT_MODE=mock pnpm dev
```

Or set `AGENT_MODE=mock` in your `.env` file. Mock agents simulate realistic tool calls, progress, and completion with fake data.

## Tech Stack

| Layer | Tech |
|-------|------|
| Framework | Next.js 15 (App Router, Turbopack) |
| Language | TypeScript (strict) |
| Styling | Tailwind CSS v4 |
| Animations | Framer Motion |
| Icons | Lucide React |
| Toasts | gooey-toast |
| Agent SDK | @anthropic-ai/claude-agent-sdk |

## Scripts

| Command | Description |
|---------|-------------|
| `pnpm dev` | Start dev server with Turbopack |
| `pnpm build` | Production build |
| `pnpm start` | Start production server |
| `pnpm lint` | Run ESLint |
| `./setup.sh` | Check prerequisites + start dev |
| `./setup.sh --docker` | Build and start via Docker |
| `./setup.sh --mock` | Start in mock mode |

## License

MIT
