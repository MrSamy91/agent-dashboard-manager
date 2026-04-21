/**
 * Registre des slash commands pour le dashboard.
 *
 * Les slash commands du vrai Claude Code CLI sont interceptées
 * par le frontend CLI, PAS par l'API SDK. On ne peut donc pas
 * les "forwarder" — on doit les implémenter localement.
 *
 * Stratégie :
 * - Commandes UI → gèrent le terminal/panel côté client
 * - Commandes info → affichent les données qu'on a déjà (agent state)
 * - Commandes agent → envoyées comme message normal au subprocess
 */

import type { AgentMessage, AgentState } from "./agent-orchestrator";
import { formatCost, formatDuration } from "./utils";

// ─── Model options (inspiré du vrai Claude Code modelOptions.ts) ────

export interface ModelOption {
  value: string;
  label: string;
  description: string;
}

/** Modèles disponibles dans le picker /model — même liste que le vrai CLI */
export const MODEL_OPTIONS: ModelOption[] = [
  { value: "",                           label: "Default (recommended)", description: "Use the default model for your plan" },
  { value: "claude-sonnet-4-6",          label: "Sonnet",                description: "Sonnet 4.6 · Best for everyday tasks" },
  { value: "claude-opus-4-6",            label: "Opus",                  description: "Opus 4.6 · Most capable for complex work" },
  { value: "claude-haiku-4-5-20251001",  label: "Haiku",                 description: "Haiku 4.5 · Fastest for quick answers" },
  { value: "claude-sonnet-4-6[1m]",      label: "Sonnet (1M context)",   description: "Sonnet 4.6 with extended context window" },
  { value: "claude-opus-4-6[1m]",        label: "Opus (1M context)",     description: "Opus 4.6 with extended context window" },
];

// ─── Types ──────────────────────────────────────────────

export type CommandCategory = "ui" | "info" | "agent";

export interface SlashCommand {
  name: string;
  description: string;
  category: CommandCategory;
}

/** Contexte passé aux handlers de commandes */
export interface CommandContext {
  setMessages: (fn: (prev: AgentMessage[]) => AgentMessage[]) => void;
  messages: AgentMessage[];
  agent: AgentState;
  onStop: (id: string) => void;
  onClose?: () => void;
  /** Envoyer un message au subprocess Claude Code */
  onResume: (id: string, message: string) => void;
  /** Ouvrir le model picker interactif (comme le vrai /model dans Claude Code) */
  openModelPicker: () => void;
}

type CommandHandler = (args: string, ctx: CommandContext) => void;

// ─── Registry ───────────────────────────────────────────

export const SLASH_COMMANDS: SlashCommand[] = [
  // UI — gèrent le terminal/panel
  { name: "/clear",       description: "Clear terminal output",              category: "ui" },
  { name: "/copy",        description: "Copy output to clipboard [N last]",  category: "ui" },
  { name: "/help",        description: "Show available commands",            category: "ui" },
  { name: "/exit",        description: "Close this panel",                   category: "ui" },
  { name: "/stop",        description: "Stop the running agent",             category: "ui" },

  // Info — affichent les données de l'agent
  { name: "/model",       description: "Show current model",                 category: "info" },
  { name: "/cost",        description: "Show token usage and cost",          category: "info" },
  { name: "/status",      description: "Show agent status details",          category: "info" },
  { name: "/session",     description: "Show session ID",                    category: "info" },
  { name: "/tools",       description: "List active tools",                  category: "info" },
  { name: "/cwd",         description: "Show working directory",             category: "info" },

  // Agent — envoyées comme message au subprocess Claude Code
  { name: "/compact",     description: "Ask agent to summarize conversation",  category: "agent" },
  { name: "/plan",        description: "Ask agent to enter plan mode",         category: "agent" },
  { name: "/review",      description: "Ask agent to review code/PR",          category: "agent" },
  { name: "/diff",        description: "Ask agent to show uncommitted changes", category: "agent" },
  { name: "/debug",       description: "Ask agent to enable debug mode",       category: "agent" },
  { name: "/test",        description: "Ask agent to run tests",               category: "agent" },
  { name: "/fix",         description: "Ask agent to fix issues",              category: "agent" },
  { name: "/explain",     description: "Ask agent to explain the code",        category: "agent" },
  { name: "/refactor",    description: "Ask agent to refactor code",           category: "agent" },
  { name: "/commit",      description: "Ask agent to commit changes",          category: "agent" },
];

// ─── Filtrage pour l'autocompletion ─────────────────────

export function filterCommands(query: string): SlashCommand[] {
  const q = query.toLowerCase();
  return SLASH_COMMANDS.filter((cmd) => cmd.name.startsWith(q));
}

// ─── Helpers ────────────────────────────────────────────

/** Message système injecté dans le terminal */
function sysMsg(content: string): AgentMessage {
  return {
    id: crypto.randomUUID(),
    timestamp: Date.now(),
    type: "system",
    content,
  };
}

/** Construire un prompt naturel à partir d'une commande agent */
function agentPrompt(cmd: string, args: string): string {
  const prompts: Record<string, string> = {
    "/compact":  "Please summarize our conversation so far to free up context.",
    "/plan":     "Enter plan mode. Design an implementation approach before writing code.",
    "/review":   `Review the code${args ? `: ${args}` : " for issues, bugs, and improvements"}.`,
    "/diff":     "Show me the uncommitted changes in the working directory.",
    "/debug":    `Enable debug mode${args ? ` for: ${args}` : ""}.`,
    "/test":     `Run the tests${args ? ` for: ${args}` : ""}.`,
    "/fix":      `Fix${args ? `: ${args}` : " the issues found"}.`,
    "/explain":  `Explain${args ? `: ${args}` : " the current code"}.`,
    "/refactor": `Refactor${args ? `: ${args}` : " the code for better quality"}.`,
    "/commit":   `Commit the changes${args ? ` with message: ${args}` : ""}.`,
  };
  return prompts[cmd] || `${cmd} ${args}`.trim();
}

// ─── Handlers ───────────────────────────────────────────

const handlers = new Map<string, CommandHandler>();

// ── UI commands ──

handlers.set("/clear", (_args, ctx) => {
  ctx.setMessages(() => [sysMsg("Terminal cleared")]);
});

handlers.set("/copy", (args, ctx) => {
  const n = parseInt(args, 10);
  const msgs = isNaN(n) ? ctx.messages : ctx.messages.slice(-n);
  const text = msgs.map((m) => m.content).join("\n");
  navigator.clipboard.writeText(text);
  ctx.setMessages((prev) => [...prev, sysMsg(`Copied ${msgs.length} message(s) to clipboard`)]);
});

handlers.set("/help", (_args, ctx) => {
  const sections: Record<string, SlashCommand[]> = {};
  for (const cmd of SLASH_COMMANDS) {
    (sections[cmd.category] ??= []).push(cmd);
  }

  let output = "Available commands:\n";
  const labels: Record<string, string> = { ui: "UI", info: "INFO", agent: "AGENT (sent to Claude)" };
  for (const [cat, cmds] of Object.entries(sections)) {
    output += `\n── ${labels[cat] || cat.toUpperCase()} ──\n`;
    for (const cmd of cmds) {
      output += `  ${cmd.name.padEnd(16)} ${cmd.description}\n`;
    }
  }

  ctx.setMessages((prev) => [...prev, sysMsg(output)]);
});

handlers.set("/exit", (_args, ctx) => {
  ctx.onClose?.();
});

handlers.set("/stop", (_args, ctx) => {
  ctx.onStop(ctx.agent.id);
});

// ── Info commands ──

handlers.set("/model", (args, ctx) => {
  if (!args.trim()) {
    // Sans argument → ouvrir le model picker interactif
    ctx.openModelPicker();
    return;
  }
  // Avec argument → résoudre l'alias et afficher
  const aliases: Record<string, string> = {
    "sonnet": "claude-sonnet-4-6",
    "opus": "claude-opus-4-6",
    "haiku": "claude-haiku-4-5-20251001",
    "sonnet[1m]": "claude-sonnet-4-6[1m]",
    "opus[1m]": "claude-opus-4-6[1m]",
  };
  const resolved = aliases[args.trim().toLowerCase()] || args.trim();
  const option = MODEL_OPTIONS.find((m) => m.value === resolved || m.label.toLowerCase() === args.trim().toLowerCase());
  if (option) {
    ctx.setMessages((prev) => [...prev, sysMsg(
      `Model set to ${option.label} (${option.value || "default"})\nNote: applies to the next agent spawn or resume.`
    )]);
  } else {
    ctx.setMessages((prev) => [...prev, sysMsg(
      `Set model to: ${resolved}\nNote: applies to the next agent spawn or resume.`
    )]);
  }
});

handlers.set("/cost", (_args, ctx) => {
  const duration = formatDuration(ctx.agent.startedAt, ctx.agent.completedAt);
  ctx.setMessages((prev) => [...prev, sysMsg(
    `Cost: ${formatCost(ctx.agent.costUsd)}\nDuration: ${duration}\nMessages: ${ctx.messages.length}`
  )]);
});

handlers.set("/status", (_args, ctx) => {
  const a = ctx.agent;
  ctx.setMessages((prev) => [...prev, sysMsg(
    [
      `Agent: ${a.name}`,
      `Status: ${a.status}`,
      `Model: ${a.model || "unknown"}`,
      `Cost: ${formatCost(a.costUsd)}`,
      `Duration: ${formatDuration(a.startedAt, a.completedAt)}`,
      `Session: ${a.sessionId || "none"}`,
      `Tools: ${a.tools.join(", ")}`,
      `CWD: ${a.workingDirectory}`,
    ].join("\n")
  )]);
});

handlers.set("/session", (_args, ctx) => {
  ctx.setMessages((prev) => [...prev, sysMsg(
    ctx.agent.sessionId || "No session ID (mock mode or not yet started)"
  )]);
});

handlers.set("/tools", (_args, ctx) => {
  ctx.setMessages((prev) => [...prev, sysMsg(
    `Active tools: ${ctx.agent.tools.join(", ")}`
  )]);
});

handlers.set("/cwd", (_args, ctx) => {
  ctx.setMessages((prev) => [...prev, sysMsg(
    `Working directory: ${ctx.agent.workingDirectory}`
  )]);
});

// ── Agent commands → convertis en prompts naturels ──

for (const cmd of SLASH_COMMANDS.filter((c) => c.category === "agent")) {
  handlers.set(cmd.name, (args, ctx) => {
    const prompt = agentPrompt(cmd.name, args);
    // Afficher le prompt dans le terminal comme un message user
    ctx.setMessages((prev) => [...prev, {
      id: crypto.randomUUID(),
      timestamp: Date.now(),
      type: "text",
      content: `> ${prompt}`,
    }]);
    // Envoyer au subprocess
    ctx.onResume(ctx.agent.id, prompt);
  });
}

export const COMMAND_HANDLERS = handlers;
