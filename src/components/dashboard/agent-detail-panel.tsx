"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { motion } from "framer-motion";
import { Square, Copy, Check, X, Plus } from "lucide-react";
import { cn, formatDuration, formatCost, getStatusColor } from "@/lib/utils";
import { TerminalOutput } from "./terminal-output";
import { CliInput } from "./cli-input";
import { COMMAND_HANDLERS, type ModelOption } from "@/lib/command-registry";
import type { AgentState, AgentMessage } from "@/lib/agent-orchestrator";

interface AgentDetailPanelProps {
  agent: AgentState | null;
  onStop: (id: string) => void;
  onResume: (id: string, message: string) => void;
  onSpawn?: () => void;
  onClose?: () => void;
  compact?: boolean;
}

export function AgentDetailPanel({ agent, onStop, onResume, onSpawn, onClose, compact }: AgentDetailPanelProps) {
  const [liveMessages, setLiveMessages] = useState<AgentMessage[]>([]);
  const [copied, setCopied] = useState(false);

  // Ref pour ouvrir le model picker depuis le handler /model
  const openModelPickerRef = useRef<(() => void) | null>(null);

  // Tick pour la durée live dans la status bar
  const [, setTick] = useState(0);

  // Connexion SSE pour le streaming temps réel des messages de l'agent
  useEffect(() => {
    if (!agent) return;

    // Réinitialiser l'affichage avec les messages existants à l'ouverture
    setLiveMessages(agent.output);

    // Pas de SSE si l'agent est déjà terminé — les données viennent du polling
    if (["completed", "error", "stopped"].includes(agent.status)) return;

    const eventSource = new EventSource(`/api/agents/${agent.id}/stream`);
    // Set des IDs déjà reçus pour une déduplication O(1)
    const seenIds = new Set<string>(agent.output.map((m) => m.id));

    eventSource.onmessage = (event) => {
      if (event.data === "[DONE]") {
        eventSource.close();
        return;
      }
      try {
        const msg = JSON.parse(event.data) as AgentMessage;
        if (seenIds.has(msg.id)) return;
        seenIds.add(msg.id);
        setLiveMessages((prev) => [...prev, msg]);
      } catch {
        /* ignore les frames malformées */
      }
    };

    eventSource.onerror = () => eventSource.close();

    return () => eventSource.close();
  }, [agent?.id, agent?.status]);

  // Timer pour mettre à jour la durée quand l'agent tourne
  const isRunning = agent?.status === "running" || agent?.status === "pending";
  useEffect(() => {
    if (!isRunning) return;
    const interval = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(interval);
  }, [isRunning]);

  const copyOutput = useCallback(() => {
    const text = liveMessages.map((m) => m.content).join("\n");
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [liveMessages]);

  // ─── CLI submit handler : commandes locales, info, agent, ou message libre ───
  const handleCliSubmit = useCallback((input: string) => {
    if (!agent) return;

    if (input.startsWith("/")) {
      const spaceIdx = input.indexOf(" ");
      const cmdName = spaceIdx === -1 ? input.trim() : input.slice(0, spaceIdx);
      const cmdArgs = spaceIdx === -1 ? "" : input.slice(spaceIdx + 1);

      const handler = COMMAND_HANDLERS.get(cmdName);
      if (handler) {
        handler(cmdArgs, {
          setMessages: setLiveMessages,
          messages: liveMessages,
          agent,
          onStop,
          onClose,
          onResume,
          openModelPicker: () => openModelPickerRef.current?.(),
        });
        return;
      }

      // Commande inconnue → afficher une erreur
      setLiveMessages((prev) => [...prev, {
        id: crypto.randomUUID(),
        timestamp: Date.now(),
        type: "error",
        content: `Unknown command: ${cmdName}\nType /help for available commands.`,
      }]);
      return;
    }

    // Message normal → envoyer au subprocess
    if (isRunning) {
      setLiveMessages((prev) => [...prev, {
        id: crypto.randomUUID(),
        timestamp: Date.now(),
        type: "system",
        content: "Agent is working... use /stop to interrupt or wait for completion.",
      }]);
      return;
    }

    onResume(agent.id, input);
  }, [agent, liveMessages, isRunning, onResume, onStop, onClose]);

  // ─── État vide — aucun agent sélectionné ───
  if (!agent) {
    return (
      <div className="flex h-full flex-col items-center justify-center p-12">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2 }}
          className="text-center"
        >
          <pre className="mx-auto font-mono text-[9px] leading-tight text-warm-600 select-none">
{`  ╭──────────────────────────╮
  │                          │
  │    select an agent       │
  │    to view its output    │
  │                          │
  ╰──────────────────────────╯`}
          </pre>

          {onSpawn && (
            <motion.button
              onClick={onSpawn}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className="mx-auto mt-5 flex items-center gap-2 border border-neon/20 bg-neon/5 px-4 py-2 font-mono text-[11px] text-neon transition-all hover:border-neon/40 hover:bg-neon/10"
            >
              <Plus className="h-3.5 w-3.5" />
              spawn agent
            </motion.button>
          )}
        </motion.div>
      </div>
    );
  }

  const status = getStatusColor(agent.status);

  return (
    <div className="h-full overflow-hidden">
      <motion.div
        key={agent.id}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.15 }}
        className="flex h-full flex-col"
      >
        {/* ─── Header du panel ─── */}
        <div className="flex items-start justify-between border-b border-noir-border px-4 py-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-3">
              <h2 className={cn(
                "truncate font-display text-warm-100",
                compact ? "text-base" : "text-2xl"
              )}>
                {agent.name}
              </h2>
              <span
                className={cn(
                  "flex-shrink-0 rounded-sm px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider",
                  status.badge
                )}
              >
                {agent.status}
              </span>
            </div>

            {/* Métadonnées — compact, mono */}
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-[11px] text-warm-400">
              <span>
                <span className="text-warm-600">time </span>
                {formatDuration(agent.startedAt, agent.completedAt)}
              </span>
              <span>
                <span className="text-warm-600">cost </span>
                {formatCost(agent.costUsd)}
              </span>
              <span>
                <span className="text-warm-600">tools </span>
                {agent.tools.join(", ")}
              </span>
              {agent.sessionId && (
                <span>
                  <span className="text-warm-600">session </span>
                  {agent.sessionId.slice(0, 12)}
                </span>
              )}
            </div>

            {/* Prompt — tronqué, discret */}
            <p className="mt-2 max-w-2xl text-xs text-warm-500 line-clamp-1">
              {agent.prompt}
            </p>
          </div>

          {/* Actions */}
          <div className="ml-4 flex items-center gap-2">
            <button
              onClick={copyOutput}
              className="flex items-center gap-1.5 rounded border border-noir-border px-2.5 py-1 font-mono text-[10px] text-warm-400 transition-colors hover:border-noir-border-light hover:text-warm-200"
            >
              {copied ? (
                <Check className="h-3 w-3 text-neon" />
              ) : (
                <Copy className="h-3 w-3" />
              )}
              {copied ? "copied" : "copy"}
            </button>

            {isRunning && (
              <motion.button
                onClick={() => onStop(agent.id)}
                whileTap={{ scale: 0.95 }}
                className="flex items-center gap-1.5 rounded border border-status-error/20 px-2.5 py-1 font-mono text-[10px] text-status-error/70 transition-colors hover:border-status-error/40 hover:bg-status-error/5 hover:text-status-error"
              >
                <Square className="h-3 w-3" />
                stop
              </motion.button>
            )}

            {onClose && (
              <button
                onClick={onClose}
                className="flex h-6 w-6 items-center justify-center text-warm-500 transition-colors hover:text-warm-200"
                title="Close panel"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Terminal output — remplit l'espace restant */}
        <div className="flex-1 min-h-0 p-2">
          <TerminalOutput messages={liveMessages} isLive={!!isRunning} />
        </div>

        {/* ─── CLI Input (remplace l'ancien textarea) ─── */}
        <CliInput
          onSubmit={handleCliSubmit}
          isRunning={!!isRunning}
          agentName={agent.name}
          onModelSelect={(model: ModelOption) => {
            const label = model.label;
            const value = model.value || "default";
            setLiveMessages((prev) => [...prev, {
              id: crypto.randomUUID(),
              timestamp: Date.now(),
              type: "system",
              content: `Model set to ${label} (${value})\nApplies to the next agent spawn or resume.`,
            }]);
          }}
          onRegisterModelPicker={(fn) => { openModelPickerRef.current = fn; }}
        />

        {/* ─── Status bar — model │ cost │ duration ─── */}
        <div className="flex items-center gap-0 border-t border-noir-border/60 bg-noir-surface px-4 py-1 font-mono text-[10px] text-warm-500">
          <span className="text-warm-400">{agent.model || "unknown"}</span>
          <span className="mx-2 text-warm-700">│</span>
          <span>{formatCost(agent.costUsd)}</span>
          <span className="mx-2 text-warm-700">│</span>
          <span>{formatDuration(agent.startedAt, agent.completedAt)}</span>
          <span className="mx-2 text-warm-700">│</span>
          <span className={cn("flex items-center gap-1.5", status.text)}>
            <span className={cn("inline-block h-1.5 w-1.5 rounded-full", status.dot, isRunning && "animate-pulse-neon")} />
            {agent.status}
          </span>
        </div>
      </motion.div>
    </div>
  );
}
