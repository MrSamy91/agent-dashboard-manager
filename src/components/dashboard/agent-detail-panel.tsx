"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { motion } from "framer-motion";
import { Square, Copy, Check, Send, CornerDownLeft, X, Plus } from "lucide-react";
import { cn, formatDuration, formatCost, getStatusColor } from "@/lib/utils";
import { TerminalOutput } from "./terminal-output";
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
  const [chatInput, setChatInput] = useState("");
  const [sending, setSending] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Connexion SSE pour le streaming temps réel des messages de l'agent
  useEffect(() => {
    if (!agent) return;

    // Réinitialiser l'affichage avec les messages existants à l'ouverture
    setLiveMessages(agent.output);

    // Pas de SSE si l'agent est déjà terminé — les données viennent du polling
    if (["completed", "error", "stopped"].includes(agent.status)) return;

    const eventSource = new EventSource(`/api/agents/${agent.id}/stream`);
    // Set des IDs déjà reçus pour une déduplication O(1) — évite les doublons
    // liés au catch-up history du SSE vs l'état initial chargé depuis agent.output
    const seenIds = new Set<string>(agent.output.map((m) => m.id));

    eventSource.onmessage = (event) => {
      if (event.data === "[DONE]") {
        eventSource.close();
        return;
      }
      try {
        const msg = JSON.parse(event.data) as AgentMessage;
        // Déduplication fiable par ID unique (vs l'ancien check timestamp+content)
        if (seenIds.has(msg.id)) return;
        seenIds.add(msg.id);
        setLiveMessages((prev) => [...prev, msg]);
      } catch {
        /* ignore les frames malformées */
      }
    };

    eventSource.onerror = () => eventSource.close();

    // Cleanup critique : fermer la connexion SSE avant d'en ouvrir une nouvelle
    // (changement d'agent sélectionné) pour éviter les connexions fantômes
    return () => eventSource.close();
  }, [agent?.id, agent?.status]);

  const copyOutput = useCallback(() => {
    const text = liveMessages.map((m) => m.content).join("\n");
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [liveMessages]);

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
          {/* ASCII art décoratif */}
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
  const isRunning = agent.status === "running" || agent.status === "pending";

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

            {/* Métadonnées en ligne — compact, mono */}
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

            {/* Bouton close — visible en multi-panel */}
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

        {/* Terminal — flex-1 min-h-0 : remplit l'espace restant et shrink si besoin */}
        <div className="flex-1 min-h-0 p-2">
          <TerminalOutput messages={liveMessages} isLive={isRunning} />
        </div>

        {/* ─── Chat input — toujours visible, désactivé quand l'agent tourne ─── */}
        <div className="flex-shrink-0 border-t border-noir-border px-4 py-2">
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                if (!chatInput.trim() || sending || isRunning) return;
                setSending(true);
                try {
                  onResume(agent.id, chatInput.trim());
                  setChatInput("");
                } finally {
                  setSending(false);
                }
              }}
              className="flex items-end gap-2"
            >
              <div className="relative flex-1">
                <textarea
                  ref={inputRef}
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={(e) => {
                    // Enter pour envoyer, Shift+Enter pour nouvelle ligne
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      e.currentTarget.form?.requestSubmit();
                    }
                  }}
                  placeholder={isRunning ? "agent is working..." : "continue the conversation..."}
                  disabled={isRunning || sending}
                  rows={1}
                  className="input-noir w-full resize-none rounded-none px-3 py-2 pr-8 font-mono text-xs leading-relaxed disabled:opacity-40"
                />
                <div className="pointer-events-none absolute bottom-2 right-2 flex items-center gap-1 font-mono text-[9px] text-warm-600">
                  <CornerDownLeft className="h-2.5 w-2.5" />
                </div>
              </div>

              <motion.button
                type="submit"
                disabled={!chatInput.trim() || sending || isRunning}
                whileTap={{ scale: 0.95 }}
                className="flex h-[34px] w-[34px] flex-shrink-0 items-center justify-center border border-neon/25 bg-neon/5 text-neon transition-all hover:border-neon/40 hover:bg-neon/10 disabled:cursor-not-allowed disabled:opacity-25"
              >
                <Send className="h-3.5 w-3.5" />
              </motion.button>
            </form>
        </div>
      </motion.div>
    </div>
  );
}
