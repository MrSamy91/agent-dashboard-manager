"use client";

/**
 * Sidebar des agents — affiche les dossiers (collapsibles avec pills status)
 * puis les agents orphelins (sans dossier) en dessous.
 * Boutons pour spawner un agent ou créer un nouveau dossier.
 */

import { useMemo, useState, useRef, useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Plus, FolderPlus } from "lucide-react";
import { AgentCard } from "./agent-card";
import { FolderSection } from "./folder-section";
import type { AgentState, Folder } from "@/lib/agent-orchestrator";

interface AgentSidebarProps {
  agents: AgentState[];
  folders: Folder[];
  selectedIds: string[];
  onSelect: (id: string) => void;
  onSpawn: () => void;
  onRename: (id: string, newName: string) => void;
  onCreateFolder: (name: string) => void;
  onRenameFolder: (id: string, newName: string) => void;
  onDeleteFolder: (id: string) => void;
  onAssignAgent: (agentId: string, folderId: string | undefined) => void;
}

export function AgentSidebar({
  agents,
  folders,
  selectedIds,
  onSelect,
  onSpawn,
  onRename,
  onCreateFolder,
  onRenameFolder,
  onDeleteFolder,
  onAssignAgent,
}: AgentSidebarProps) {
  /**
   * Grouper les agents par dossier en un seul pass O(n).
   * Les agents dont le folderId ne correspond à aucun folder existant
   * sont traités comme orphelins (robustesse si un folder est supprimé).
   */
  const { folderMap, orphans } = useMemo(() => {
    const folderIds = new Set(folders.map((f) => f.id));
    const map = new Map<string, AgentState[]>();
    const orphanList: AgentState[] = [];

    for (const agent of agents) {
      if (agent.folderId && folderIds.has(agent.folderId)) {
        const list = map.get(agent.folderId) || [];
        list.push(agent);
        map.set(agent.folderId, list);
      } else {
        orphanList.push(agent);
      }
    }
    return { folderMap: map, orphans: orphanList };
  }, [agents, folders]);

  // ─── Pinned agents — persisté dans localStorage ───
  const [pinnedIds, setPinnedIds] = useState<Set<string>>(() => {
    // Hydrate depuis localStorage au mount (SSR-safe : check window)
    if (typeof window !== "undefined") {
      try {
        const stored = localStorage.getItem("dashboard-pinned-agents");
        if (stored) return new Set(JSON.parse(stored) as string[]);
      } catch { /* localStorage invalide, on repart à vide */ }
    }
    return new Set();
  });

  /** Persister les pinnedIds dans localStorage à chaque changement */
  useEffect(() => {
    localStorage.setItem("dashboard-pinned-agents", JSON.stringify([...pinnedIds]));
  }, [pinnedIds]);

  /** Toggle pin/unpin d'un agent */
  const togglePin = (id: string) => {
    setPinnedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Séparer les orphelins en pinned (en haut) et unpinned (en bas)
  const pinnedOrphans = useMemo(() => orphans.filter((a) => pinnedIds.has(a.id)), [orphans, pinnedIds]);
  const unpinnedOrphans = useMemo(() => orphans.filter((a) => !pinnedIds.has(a.id)), [orphans, pinnedIds]);

  const isEmpty = agents.length === 0 && folders.length === 0;
  /** True quand on a des folders mais aucun agent nulle part */
  const hasOnlyEmptyFolders = agents.length === 0 && folders.length > 0;

  /**
   * Flash neon sur le dernier folder cree.
   * On track le nombre de folders pour detecter un ajout.
   */
  const prevFolderCount = useRef(folders.length);
  const [flashFolderId, setFlashFolderId] = useState<string | null>(null);

  useEffect(() => {
    if (folders.length > prevFolderCount.current) {
      // Le dernier folder dans la liste est le nouveau
      const newest = folders[folders.length - 1];
      if (newest) {
        setFlashFolderId(newest.id);
        const timer = setTimeout(() => setFlashFolderId(null), 800);
        return () => clearTimeout(timer);
      }
    }
    prevFolderCount.current = folders.length;
  }, [folders]);

  return (
    <aside className="flex h-full flex-col">
      {/* Header avec label + boutons */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-noir-border">
        <div className="flex items-center gap-2">
          <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-warm-400">
            Agents
          </span>
          <span className="font-mono text-[10px] tabular-nums text-warm-500">
            {agents.length}
          </span>
        </div>

        <div className="flex items-center gap-1">
          {/* Bouton créer un dossier */}
          <motion.button
            onClick={() => onCreateFolder("New Folder")}
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            className="flex h-5 w-5 items-center justify-center border border-warm-600/20 bg-warm-600/5 text-warm-500 transition-colors hover:border-warm-500/40 hover:text-warm-300"
            title="New folder"
          >
            <FolderPlus className="h-3 w-3" />
          </motion.button>

          {/* Bouton spawn agent */}
          <motion.button
            onClick={onSpawn}
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            className="flex h-5 w-5 items-center justify-center border border-neon/20 bg-neon/5 text-neon transition-colors hover:border-neon/40 hover:bg-neon/10"
            title="Spawn new agent"
          >
            <Plus className="h-3 w-3" />
          </motion.button>
        </div>
      </div>

      {/* Liste scrollable */}
      <div className="custom-scrollbar flex-1 overflow-y-auto">
        {isEmpty ? (
          <motion.div
            key="empty"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex flex-col items-center justify-center px-5 py-20 text-center"
          >
            <pre className="font-mono text-[10px] leading-tight text-warm-500 select-none">
{`  ┌─────────┐
  │  empty  │
  └─────────┘`}
            </pre>
            <p className="mt-4 font-mono text-[10px] text-warm-400">
              no agents running
            </p>
            <p className="mt-1 font-mono text-[10px] text-warm-500">
              press <span className="text-neon/70">+</span> to start
            </p>
          </motion.div>
        ) : (
          <>
            {/* ─── Dossiers ─── */}
            {folders.map((folder) => (
              <FolderSection
                key={folder.id}
                folder={folder}
                agents={folderMap.get(folder.id) || []}
                selectedIds={selectedIds}
                onSelect={onSelect}
                onRenameAgent={onRename}
                onRenameFolder={onRenameFolder}
                onDeleteFolder={onDeleteFolder}
                onAssignAgent={onAssignAgent}
                flashNeon={flashFolderId === folder.id}
                pinnedIds={pinnedIds}
                onTogglePin={togglePin}
              />
            ))}

            {/* ─── Orphelins pinned — toujours en premier ─── */}
            {pinnedOrphans.length > 0 && (
              <>
                <div className="flex items-center gap-2 px-5 py-2 font-mono text-[9px] uppercase tracking-[0.2em] text-neon/40">
                  <span>Pinned</span>
                  <span className="inline-flex items-center justify-center px-1 py-px font-mono text-[9px] tabular-nums leading-none bg-neon/8 text-neon/50">
                    {pinnedOrphans.length}
                  </span>
                </div>
                <AnimatePresence mode="popLayout">
                  {pinnedOrphans.map((agent) => (
                    <AgentCard
                      key={agent.id}
                      agent={agent}
                      isSelected={selectedIds.includes(agent.id)}
                      onSelect={() => onSelect(agent.id)}
                      onRename={onRename}
                      isPinned
                      onTogglePin={() => togglePin(agent.id)}
                    />
                  ))}
                </AnimatePresence>
              </>
            )}

            {/* ─── Séparateur si on a des folders ET des orphelins non-pinned ─── */}
            {folders.length > 0 && unpinnedOrphans.length > 0 && (
              <div className="flex items-center gap-2 px-5 py-2 font-mono text-[9px] uppercase tracking-[0.2em] text-warm-600">
                <span>Ungrouped</span>
                <span className="inline-flex items-center justify-center px-1 py-px font-mono text-[9px] tabular-nums leading-none bg-warm-600/10 text-warm-500">
                  {unpinnedOrphans.length}
                </span>
              </div>
            )}

            {/* ─── Agents orphelins non-pinned ─── */}
            <AnimatePresence mode="popLayout">
              {unpinnedOrphans.map((agent) => (
                <AgentCard
                  key={agent.id}
                  agent={agent}
                  isSelected={selectedIds.includes(agent.id)}
                  onSelect={() => onSelect(agent.id)}
                  onRename={onRename}
                  onTogglePin={() => togglePin(agent.id)}
                />
              ))}
            </AnimatePresence>

            {/* ─── Empty state quand on a des folders mais aucun agent ─── */}
            {hasOnlyEmptyFolders && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="px-5 py-10 text-center"
              >
                <p className="font-mono text-[10px] text-warm-500">
                  no agents running
                </p>
                <p className="mt-1 font-mono text-[10px] text-warm-600">
                  press <span className="text-neon/70">+</span> to spawn one
                </p>
              </motion.div>
            )}
          </>
        )}
      </div>
    </aside>
  );
}
