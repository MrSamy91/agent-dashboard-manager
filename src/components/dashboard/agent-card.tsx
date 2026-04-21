"use client";

import { useState, useRef, useEffect } from "react";
import { motion } from "framer-motion";
import { Pencil, X } from "lucide-react";
import { cn, formatDuration, formatCost, getStatusColor } from "@/lib/utils";
import type { AgentState } from "@/lib/agent-orchestrator";

interface AgentCardProps {
  agent: AgentState;
  isSelected: boolean;
  onSelect: () => void;
  onRename: (id: string, newName: string) => void;
  /** Si fourni, affiche un bouton X pour retirer l'agent du dossier */
  onRemoveFromFolder?: () => void;
}

export function AgentCard({ agent, isSelected, onSelect, onRename, onRemoveFromFolder }: AgentCardProps) {
  const status = getStatusColor(agent.status);
  const isRunning = agent.status === "running";

  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(agent.name);
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus l'input quand on passe en mode édition
  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  // Valider le rename
  const commitRename = () => {
    setEditing(false);
    const trimmed = editName.trim();
    if (trimmed && trimmed !== agent.name) {
      onRename(agent.id, trimmed);
    } else {
      setEditName(agent.name); // reset si vide
    }
  };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: -12 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -12 }}
      onClick={onSelect}
      // ─── Drag & drop natif : l'agent peut être droppé dans un folder ───
      // On utilise les events natifs (pas framer-motion drag) pour le DnD sidebar
      draggable={!editing}
      onDragStart={(e) => {
        const nativeEvent = e as unknown as React.DragEvent;
        nativeEvent.dataTransfer?.setData("agent-id", agent.id);
        // Force le curseur "grab" pendant le drag (necessaire sur Windows)
        if (nativeEvent.dataTransfer) {
          nativeEvent.dataTransfer.effectAllowed = "move";
        }
      }}
      className={cn(
        "group relative w-full border-b border-noir-border px-5 py-3.5 text-left transition-colors",
        isSelected
          ? "bg-noir-elevated"
          : "bg-transparent hover:bg-noir-card",
        !editing && "[cursor:grab] active:[cursor:grabbing]"
      )}
    >
      {/* Indicateur vert à gauche quand sélectionné */}
      {isSelected && (
        <motion.div
          layoutId="sidebar-indicator"
          className="absolute left-0 top-0 bottom-0 w-[2px] bg-neon"
          transition={{ type: "spring", damping: 30, stiffness: 400 }}
        />
      )}

      <div className="flex items-start gap-3">
        {/* Status dot */}
        <div className="mt-[5px] flex-shrink-0">
          <span
            className={cn(
              "block h-[7px] w-[7px] rounded-full",
              status.dot,
              isRunning && "animate-pulse-neon",
              isRunning && "shadow-[0_0_6px_#00ff8840]"
            )}
          />
        </div>

        <div className="min-w-0 flex-1">
          {/* Nom — mode affichage ou mode édition */}
          <div className="flex items-center gap-1.5">
            {editing ? (
              <input
                ref={inputRef}
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                onBlur={commitRename}
                onKeyDown={(e) => {
                  if (e.key === "Enter") commitRename();
                  if (e.key === "Escape") { setEditing(false); setEditName(agent.name); }
                }}
                onClick={(e) => e.stopPropagation()}
                className="min-w-0 flex-1 bg-transparent font-display text-sm text-warm-100 outline-none border-b border-neon/30 pb-0.5"
              />
            ) : (
              <>
                <p
                  className={cn(
                    "truncate font-display text-sm",
                    isSelected ? "text-warm-100" : "text-warm-200"
                  )}
                  /* Tooltip natif avec le prompt complet — utile pour voir ce que fait l'agent */
                  title={agent.prompt}
                >
                  {agent.name}
                </p>
                {/* Bouton crayon — visible au hover */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setEditName(agent.name);
                    setEditing(true);
                  }}
                  className="flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity text-warm-500 hover:text-warm-300"
                  title="Rename"
                >
                  <Pencil className="h-2.5 w-2.5" />
                </button>
                {/* Bouton X — retirer du dossier (visible si agent dans un folder) */}
                {onRemoveFromFolder && (
                  <button
                    onClick={(e) => { e.stopPropagation(); onRemoveFromFolder(); }}
                    className="flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity text-warm-500 hover:text-status-error"
                    title="Remove from folder"
                  >
                    <X className="h-2.5 w-2.5" />
                  </button>
                )}
              </>
            )}
          </div>

          {/* Méta en mono */}
          <div className="mt-1 flex items-center gap-1.5 font-mono text-[10px] text-warm-500">
            <span className={status.text}>{agent.status}</span>
            <span className="text-warm-600">·</span>
            <span>{formatDuration(agent.startedAt, agent.completedAt)}</span>
            {agent.costUsd > 0 && (
              <>
                <span className="text-warm-600">·</span>
                <span>{formatCost(agent.costUsd)}</span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Shimmer bar pour les agents running */}
      {isRunning && (
        <div className="mt-2.5 h-px w-full overflow-hidden bg-noir-border">
          <motion.div
            className="h-full w-1/3 bg-gradient-to-r from-transparent via-neon/40 to-transparent"
            animate={{ x: ["-100%", "400%"] }}
            transition={{ duration: 2.5, repeat: Infinity, ease: "linear" }}
          />
        </div>
      )}
    </motion.div>
  );
}
