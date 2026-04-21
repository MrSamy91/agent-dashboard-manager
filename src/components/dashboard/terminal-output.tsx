"use client";

/**
 * Terminal output — affichage des messages d'un agent.
 * Style inspiré de Claude Code CLI : messages user en vert,
 * tool calls mis en valeur, erreurs avec bordure rouge,
 * messages système init stylés comme des blocs info.
 */

import { useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import type { AgentMessage } from "@/lib/agent-orchestrator";

/**
 * Formatter Intl instancié une seule fois au niveau module.
 * Créer un Intl.DateTimeFormat à chaque appel coûte ~0.5ms
 */
const TIME_FORMATTER = new Intl.DateTimeFormat("fr-FR", {
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

/**
 * Seuil à partir duquel les animations d'entrée sont désactivées.
 * Au-delà de 50 messages, animer chaque ligne cause des janks.
 */
const ANIMATION_THRESHOLD = 50;

interface TerminalOutputProps {
  messages: AgentMessage[];
  isLive: boolean;
}

/** Timestamp en HH:MM:SS */
function formatTime(ts: number): string {
  return TIME_FORMATTER.format(new Date(ts));
}

/** Badge minimaliste pour chaque type de message */
function TypeTag({ type }: { type: AgentMessage["type"] }) {
  const config: Record<string, { label: string; color: string }> = {
    system:      { label: "sys",  color: "text-warm-500" },
    text:        { label: "out",  color: "text-neon/70" },
    tool_use:    { label: "call", color: "text-status-completed/70" },
    tool_result: { label: "res",  color: "text-warm-500" },
    error:       { label: "err",  color: "text-status-error/80" },
  };

  const { label, color } = config[type] || config.system;

  return (
    <span className={cn("w-8 flex-shrink-0 text-right font-mono text-[10px] uppercase", color)}>
      {label}
    </span>
  );
}

/** Détermine si un message système est un bloc init SDK */
function isInitMessage(msg: AgentMessage): boolean {
  return msg.type === "system" && (
    msg.content.startsWith("SDK connected") ||
    msg.content.startsWith("Agent starting") ||
    msg.content.startsWith("Resuming session")
  );
}

/** Détermine si c'est un message user (prompt forwarded via resume) */
function isUserMessage(msg: AgentMessage): boolean {
  return msg.type === "text" && msg.content.startsWith("> ");
}

/** Extraire le nom de l'outil et les args d'un tool_use message */
function parseToolCall(content: string): { toolName: string; args: string } | null {
  const match = content.match(/^Calling (\w+)\((.[\s\S]+)\)$/);
  if (!match) return null;
  return { toolName: match[1], args: match[2] };
}

export function TerminalOutput({ messages, isLive }: TerminalOutputProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  const animationsEnabled = messages.length <= ANIMATION_THRESHOLD;

  return (
    <div className="terminal-crt relative flex h-full flex-col overflow-hidden rounded-none border border-noir-border bg-black/80">
      {/* Barre de titre — minimaliste comme un vrai terminal */}
      <div className="flex items-center justify-between border-b border-noir-border/60 bg-noir-card/60 px-4 py-2">
        <div className="flex items-center gap-3">
          <div className="flex gap-1.5">
            <div className="h-2 w-2 rounded-full bg-warm-600/40" />
            <div className="h-2 w-2 rounded-full bg-warm-600/40" />
            <div className="h-2 w-2 rounded-full bg-warm-600/40" />
          </div>
          <span className="font-mono text-[10px] tracking-wide text-warm-600">
            output
          </span>
        </div>

        {isLive && (
          <div className="flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-neon animate-pulse-neon shadow-[0_0_4px_#00ff8840]" />
            <span className="font-mono text-[9px] uppercase tracking-[0.2em] text-neon/60">
              live
            </span>
          </div>
        )}
      </div>

      {/* Corps du terminal */}
      <div className="custom-scrollbar relative flex-1 min-h-0 overflow-y-auto px-4 py-3">
        {messages.length === 0 ? (
          <div className="flex h-full items-center justify-center">
            <span className="font-mono text-xs text-warm-600">
              awaiting output<span className="animate-cursor text-neon/50">_</span>
            </span>
          </div>
        ) : (
          <AnimatePresence mode="popLayout">
            {messages.map((msg) => {
              const isInit = isInitMessage(msg);
              const isUser = isUserMessage(msg);
              const toolCall = msg.type === "tool_use" ? parseToolCall(msg.content) : null;

              return (
                <motion.div
                  key={msg.id}
                  initial={animationsEnabled ? { opacity: 0, y: 4 } : false}
                  animate={animationsEnabled ? { opacity: 1, y: 0 } : undefined}
                  transition={{ duration: 0.15 }}
                  className={cn(
                    "terminal-line group flex items-start gap-3 rounded-sm px-1.5 py-[3px]",
                    "transition-colors hover:bg-white/[0.02]",
                    // Styles spéciaux par type de message
                    msg.type === "error" && "bg-status-error/[0.03] border-l-2 border-status-error/30 pl-3",
                    isInit && "bg-neon/[0.02] border-l-2 border-neon/20 pl-3",
                    isUser && "bg-neon/[0.01]"
                  )}
                >
                  {/* Timestamp */}
                  <span className="flex-shrink-0 font-mono text-[10px] tabular-nums text-warm-600/50 group-hover:text-warm-600">
                    {formatTime(msg.timestamp)}
                  </span>

                  {/* Type tag */}
                  <TypeTag type={msg.type} />

                  {/* Séparateur vertical */}
                  <span className="mt-[2px] flex-shrink-0 text-warm-700">│</span>

                  {/* Contenu du message — formatting spécial par type */}
                  {isUser ? (
                    /* Message user : prompt ">" vert + contenu */
                    <span className="whitespace-pre-wrap break-words">
                      <span className="font-bold text-neon">&gt; </span>
                      <span className="text-neon/80">{msg.content.slice(2)}</span>
                    </span>
                  ) : toolCall ? (
                    /* Tool call : nom en neon + args en gris */
                    <span className="whitespace-pre-wrap break-words">
                      <span className="font-medium text-neon">{toolCall.toolName}</span>
                      <span className="text-warm-500">(</span>
                      <span className="text-warm-400">{toolCall.args}</span>
                      <span className="text-warm-500">)</span>
                    </span>
                  ) : (
                    /* Autres messages : style par type */
                    <span
                      className={cn(
                        "whitespace-pre-wrap break-words",
                        msg.type === "text" && "text-warm-100",
                        msg.type === "tool_result" && "text-warm-400",
                        msg.type === "system" && "text-warm-500 italic",
                        msg.type === "error" && "text-status-error/80"
                      )}
                    >
                      {msg.content}
                    </span>
                  )}
                </motion.div>
              );
            })}
          </AnimatePresence>
        )}

        {/* Curseur vert clignotant */}
        {isLive && messages.length > 0 && (
          <div className="mt-1 pl-1 font-mono text-sm">
            <span className="animate-cursor text-neon">_</span>
          </div>
        )}

        <div ref={bottomRef} />
      </div>
    </div>
  );
}
