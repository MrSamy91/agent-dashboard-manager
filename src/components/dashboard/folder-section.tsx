"use client";

/**
 * Section pliable pour un dossier dans la sidebar.
 * Affiche le header (nom, count, pills status) et les agents enfants.
 * Drop zone pour glisser un agent dans le dossier.
 * Rename inline (meme pattern que AgentCard).
 */

import { useState, useRef, useEffect, useMemo, type DragEvent } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronRight, FolderOpen, Pencil, Trash2 } from "lucide-react";
import { cn, getStatusColor } from "@/lib/utils";
import { AgentCard } from "./agent-card";
import type { AgentState, Folder } from "@/lib/agent-orchestrator";

interface FolderSectionProps {
  folder: Folder;
  agents: AgentState[];
  selectedIds: string[];
  onSelect: (id: string) => void;
  onRenameAgent: (id: string, newName: string) => void;
  onRenameFolder: (id: string, newName: string) => void;
  onDeleteFolder: (id: string) => void;
  onAssignAgent: (agentId: string, folderId: string | undefined) => void;
}

/** Compteurs de statut pour les pills */
interface StatusCounts {
  running: number;
  completed: number;
  error: number;
  stopped: number;
}

export function FolderSection({
  folder,
  agents,
  selectedIds,
  onSelect,
  onRenameAgent,
  onRenameFolder,
  onDeleteFolder,
  onAssignAgent,
}: FolderSectionProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  // ─── Rename inline (meme pattern que AgentCard) ───
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(folder.name);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  const commitRename = () => {
    setEditing(false);
    const trimmed = editName.trim();
    if (trimmed && trimmed !== folder.name) {
      onRenameFolder(folder.id, trimmed);
    } else {
      setEditName(folder.name);
    }
  };

  // ─── Status pills — un seul pass O(n) ───
  const counts = useMemo<StatusCounts>(() => {
    const c: StatusCounts = { running: 0, completed: 0, error: 0, stopped: 0 };
    for (const a of agents) {
      if (a.status === "running" || a.status === "pending") c.running++;
      else if (a.status === "completed") c.completed++;
      else if (a.status === "error") c.error++;
      else if (a.status === "stopped") c.stopped++;
    }
    return c;
  }, [agents]);

  // ─── Drop zone handlers ───
  const handleDragOver = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(true);
  };

  const handleDragLeave = () => setDragOver(false);

  const handleDrop = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
    const agentId = e.dataTransfer.getData("agent-id");
    if (agentId) onAssignAgent(agentId, folder.id);
  };

  return (
    <div>
      {/* ─── Header du dossier ─── */}
      <div
        onClick={() => !editing && setCollapsed((c) => !c)}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={cn(
          "group flex items-center gap-2 px-4 py-2.5 cursor-pointer transition-colors border-b border-noir-border",
          "hover:bg-noir-card",
          dragOver && "ring-1 ring-inset ring-neon/30 bg-neon/[0.03]"
        )}
      >
        {/* Chevron rotation */}
        <motion.div
          animate={{ rotate: collapsed ? 0 : 90 }}
          transition={{ duration: 0.15 }}
          className="flex-shrink-0 text-warm-500"
        >
          <ChevronRight className="h-3 w-3" />
        </motion.div>

        {/* Icone folder */}
        <FolderOpen className="h-3.5 w-3.5 flex-shrink-0 text-warm-400" />

        {/* Nom — mode affichage ou édition */}
        <div className="flex min-w-0 flex-1 items-center gap-1.5">
          {editing ? (
            <input
              ref={inputRef}
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              onBlur={commitRename}
              onKeyDown={(e) => {
                if (e.key === "Enter") commitRename();
                if (e.key === "Escape") { setEditing(false); setEditName(folder.name); }
              }}
              onClick={(e) => e.stopPropagation()}
              className="min-w-0 flex-1 bg-transparent font-mono text-xs text-warm-100 outline-none border-b border-neon/30 pb-0.5"
            />
          ) : (
            <span className="truncate font-mono text-xs text-warm-200">
              {folder.name}
            </span>
          )}
        </div>

        {/* Compteur d'agents */}
        <span className="flex-shrink-0 font-mono text-[10px] tabular-nums text-warm-500">
          {agents.length}
        </span>

        {/* Status pills — petits badges colorés */}
        <div className="flex items-center gap-1">
          {counts.running > 0 && (
            <StatusPill count={counts.running} status="running" />
          )}
          {counts.completed > 0 && (
            <StatusPill count={counts.completed} status="completed" />
          )}
          {counts.error > 0 && (
            <StatusPill count={counts.error} status="error" />
          )}
          {counts.stopped > 0 && (
            <StatusPill count={counts.stopped} status="stopped" />
          )}
        </div>

        {/* Actions — visibles au hover */}
        <div className="flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
          {!editing && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                setEditName(folder.name);
                setEditing(true);
              }}
              className="flex h-4 w-4 items-center justify-center text-warm-500 hover:text-warm-300"
              title="Rename folder"
            >
              <Pencil className="h-2.5 w-2.5" />
            </button>
          )}
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDeleteFolder(folder.id);
            }}
            className="flex h-4 w-4 items-center justify-center text-warm-500 hover:text-status-error"
            title="Delete folder"
          >
            <Trash2 className="h-2.5 w-2.5" />
          </button>
        </div>
      </div>

      {/* ─── Liste des agents enfants (collapsible) ─── */}
      <AnimatePresence initial={false}>
        {!collapsed && agents.length > 0 && (
          <motion.div
            key="folder-content"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
            className="overflow-hidden"
          >
            {/* Indent visuel : padding-left pour montrer la hiérarchie */}
            <div className="border-l border-noir-border-light ml-6">
              <AnimatePresence mode="popLayout">
                {agents.map((agent) => (
                  <AgentCard
                    key={agent.id}
                    agent={agent}
                    isSelected={selectedIds.includes(agent.id)}
                    onSelect={() => onSelect(agent.id)}
                    onRename={onRenameAgent}
                    onRemoveFromFolder={() => onAssignAgent(agent.id, undefined)}
                  />
                ))}
              </AnimatePresence>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/** Petit badge coloré pour un statut donné */
function StatusPill({ count, status }: { count: number; status: string }) {
  const colors = getStatusColor(status);
  return (
    <span
      className={cn(
        "inline-flex items-center justify-center px-1 py-px font-mono text-[9px] tabular-nums leading-none",
        colors.badge
      )}
    >
      {count}
    </span>
  );
}
