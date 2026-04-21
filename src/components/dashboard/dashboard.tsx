"use client";

import { useState, useEffect, useCallback, useRef, type DragEvent } from "react";
import { motion } from "framer-motion";
import { Columns2, Grid2X2, Maximize } from "lucide-react";
import { cn } from "@/lib/utils";
import { Header } from "./header";
import { StatsCards } from "./stats-cards";
import { AgentSidebar } from "./agent-sidebar";
import { AgentDetailPanel } from "./agent-detail-panel";
import { SpawnDialog } from "./spawn-dialog";
import {
  toastAgentSpawned,
  toastAgentCompleted,
  toastAgentError,
  toastAgentStopped,
  toastFolderCreated,
  toastFolderDeleted,
  playNotificationSound,
} from "@/lib/toasts";
import {
  createFolder as createFolderAction,
  renameFolder as renameFolderAction,
  deleteFolder as deleteFolderAction,
  assignAgentToFolder as assignAgentAction,
} from "@/lib/actions/folders";
import type { AgentState, SpawnTask, Folder } from "@/lib/agent-orchestrator";

/**
 * Modes de layout multi-panel :
 * - 1 : plein écran (1 agent)
 * - 2 : split vertical (2 colonnes)
 * - 4 : grille 2×2 (4 agents)
 */
type LayoutMode = 1 | 2 | 4;

interface DashboardProps {
  /** Agents pré-chargés côté serveur (SSR) — évite le flash vide */
  initialAgents: AgentState[];
  /** Dossiers pré-chargés côté serveur (SSR) */
  initialFolders: Folder[];
}

export function Dashboard({ initialAgents, initialFolders }: DashboardProps) {
  const [agents, setAgents] = useState<AgentState[]>(initialAgents);
  const [folders, setFolders] = useState<Folder[]>(initialFolders);
  const [showSpawn, setShowSpawn] = useState(false);

  // Multi-panel : liste des agent IDs affichés (max 4)
  const [panels, setPanels] = useState<(string | null)[]>([null]);
  const [layoutMode, setLayoutMode] = useState<LayoutMode>(1);
  // Panel focus : index du panel qui reçoit le prochain agent cliqué
  const [focusedPanel, setFocusedPanel] = useState(0);
  // Drag & drop : index du panel survolé pendant un drag
  const [dragOverPanel, setDragOverPanel] = useState<number | null>(null);

  const agentsRef = useRef<AgentState[]>(agents);
  agentsRef.current = agents;

  // ─── Sidebar resizable — drag du bord droit ───
  const [sidebarWidth, setSidebarWidth] = useState(288); // 288px = 18rem (w-72)
  const isResizingRef = useRef(false);
  const [isResizing, setIsResizing] = useState(false); // pour le style du handle pendant le drag

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizingRef.current) return;
      // Clamp entre 200px et 480px
      const newWidth = Math.min(480, Math.max(200, e.clientX));
      setSidebarWidth(newWidth);
    };
    const handleMouseUp = () => {
      if (isResizingRef.current) {
        isResizingRef.current = false;
        setIsResizing(false);
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
      }
    };
    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, []);

  /** Démarre le resize du sidebar */
  const startResize = useCallback(() => {
    isResizingRef.current = true;
    setIsResizing(true);
    // Empêcher la sélection de texte et forcer le curseur pendant le drag
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  }, []);

  // ─── Tab title dynamique — "2 running | Agent Dashboard" ───
  useEffect(() => {
    const running = agents.filter((a) => a.status === "running" || a.status === "pending").length;
    const errored = agents.filter((a) => a.status === "error").length;
    const parts: string[] = [];
    if (running > 0) parts.push(`${running} running`);
    if (errored > 0) parts.push(`${errored} error`);
    document.title = parts.length > 0
      ? `${parts.join(" · ")} | Agent Dashboard`
      : "Agent Dashboard";
  }, [agents]);

  // ─── Détection des changements de statut pour les toasts ───
  const prevStatusRef = useRef<Map<string, AgentState["status"]>>(
    new Map(initialAgents.map((a) => [a.id, a.status]))
  );

  // ─── Polling adaptatif ───
  useEffect(() => {
    let active = true;
    let timeoutId: ReturnType<typeof setTimeout>;

    const poll = async () => {
      try {
        const res = await fetch("/api/agents");
        if (res.ok && active) {
          const data = await res.json();

          // ─── Agents : appliquer name overrides ───
          const merged = (data.agents as AgentState[]).map((a) => {
            const nameOv = nameOverrides.current.get(a.id);
            return nameOv ? { ...a, name: nameOv } : a;
          });
          setAgents(merged);

          // ─── Folders : appliquer folder name overrides ───
          if (data.folders) {
            const mergedFolders = (data.folders as Folder[]).map((f) => {
              const folderOv = folderNameOverrides.current.get(f.id);
              return folderOv ? { ...f, name: folderOv } : f;
            });
            setFolders(mergedFolders);
          }

          // ─── Détection changements de statut → toasts + notification sonore ───
          for (const agent of merged) {
            const prevStatus = prevStatusRef.current.get(agent.id);
            if (prevStatus && prevStatus !== agent.status) {
              if (agent.status === "completed") {
                toastAgentCompleted(agent.name);
                playNotificationSound();
              } else if (agent.status === "error") {
                toastAgentError(agent.name);
                playNotificationSound();
              } else if (agent.status === "stopped") {
                toastAgentStopped(agent.name);
              }
            }
          }
          // Mettre à jour la ref pour la prochaine comparaison
          prevStatusRef.current = new Map(merged.map((a) => [a.id, a.status]));

          const hasActive = (data.agents as AgentState[]).some(
            (a) => a.status === "running" || a.status === "pending"
          );
          if (active) timeoutId = setTimeout(poll, hasActive ? 3000 : 5000);
        }
      } catch {
        if (active) timeoutId = setTimeout(poll, 5000);
      }
    };
    poll();
    return () => { active = false; clearTimeout(timeoutId); };
  }, []);

  // ─── Changer le layout → ajuste le nombre de slots ───
  const changeLayout = useCallback((mode: LayoutMode) => {
    setLayoutMode(mode);
    setFocusedPanel(0);
    setPanels((prev) => {
      const newPanels = [...prev];
      while (newPanels.length < mode) newPanels.push(null);
      while (newPanels.length > mode) newPanels.pop();
      return newPanels;
    });
  }, []);

  // ─── Sélectionner un agent → va dans le panel focus ───
  const selectAgent = useCallback((id: string) => {
    setPanels((prev) => {
      // Si l'agent est déjà dans un panel, focus ce panel au lieu de dupliquer
      const existingIdx = prev.indexOf(id);
      if (existingIdx !== -1) {
        setFocusedPanel(existingIdx);
        return prev;
      }

      const newPanels = [...prev];
      // Placer dans le panel focus actuel
      newPanels[focusedPanel] = id;
      return newPanels;
    });
  }, [focusedPanel]);

  // ─── Fermer un panel ───
  const closePanel = useCallback((index: number) => {
    setPanels((prev) => {
      const newPanels = [...prev];
      newPanels[index] = null;
      return newPanels;
    });
  }, []);

  // ─── Global keyboard shortcuts ───
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Ignorer si l'utilisateur tape dans un input/textarea
      const tag = (e.target as HTMLElement).tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;

      // Ctrl+N → ouvrir spawn dialog
      if (e.ctrlKey && e.key === "n") {
        e.preventDefault();
        setShowSpawn(true);
      }
      // Ctrl+1/2/3/4 → focus panel
      if (e.ctrlKey && e.key >= "1" && e.key <= "4") {
        const idx = parseInt(e.key) - 1;
        if (idx < panels.length) {
          e.preventDefault();
          setFocusedPanel(idx);
        }
      }
      // Ctrl+W → fermer le panel focus (en multi-panel)
      if (e.ctrlKey && e.key === "w" && layoutMode > 1) {
        e.preventDefault();
        closePanel(focusedPanel);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [panels.length, layoutMode, focusedPanel, closePanel]);

  const spawnAgent = useCallback(async (task: SpawnTask) => {
    try {
      const res = await fetch("/api/agents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(task),
      });
      if (res.ok) {
        const data = await res.json();
        selectAgent(data.id);
        setShowSpawn(false);
        toastAgentSpawned(task.name);
      } else {
        const err = await res.json().catch(() => null);
        console.error("Spawn failed:", res.status, err?.error ?? res.statusText);
      }
    } catch (err) {
      console.error("Failed to spawn agent:", err);
    }
  }, [selectAgent]);

  const stopAgent = useCallback(async (id: string) => {
    const agent = agentsRef.current.find((a) => a.id === id);
    // Optimistic : marquer "stopped" immédiatement côté client
    if (agent) {
      setAgents((prev) =>
        prev.map((a) => (a.id === id ? { ...a, status: "stopped" as const, completedAt: Date.now() } : a))
      );
      toastAgentStopped(agent.name);
    }
    try {
      await fetch(`/api/agents/${id}`, { method: "DELETE" });
    } catch {
      console.error("Failed to stop agent");
    }
  }, []);

  const resumeAgent = useCallback(async (id: string, message: string) => {
    try {
      const res = await fetch(`/api/agents/${id}/resume`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        console.error("Resume failed:", res.status, err?.error ?? res.statusText);
      }
    } catch (err) {
      console.error("Failed to resume agent:", err);
    }
  }, []);

  // ─── Rename agents — optimistic update + protection polling ───
  const nameOverrides = useRef<Map<string, string>>(new Map());

  const renameAgent = useCallback(async (id: string, newName: string) => {
    nameOverrides.current.set(id, newName);
    setAgents((prev) =>
      prev.map((a) => (a.id === id ? { ...a, name: newName } : a))
    );
    try {
      const res = await fetch(`/api/agents/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName }),
      });
      if (res.ok) {
        setTimeout(() => nameOverrides.current.delete(id), 6000);
      }
    } catch {
      console.error("Failed to rename agent");
      nameOverrides.current.delete(id);
    }
  }, []);

  // ─── Folder CRUD via Server Actions ───
  const folderNameOverrides = useRef<Map<string, string>>(new Map());

  const handleCreateFolder = useCallback(async (name: string) => {
    // Optimistic : ajouter le folder immédiatement avec un ID temporaire
    const tempId = `temp-${crypto.randomUUID()}`;
    const optimisticFolder: Folder = { id: tempId, name };
    setFolders((prev) => [...prev, optimisticFolder]);
    toastFolderCreated(name);

    try {
      const realFolder = await createFolderAction(name);
      // Remplacer le folder temporaire par le vrai (avec l'ID serveur)
      setFolders((prev) =>
        prev.map((f) => (f.id === tempId ? realFolder : f))
      );
    } catch {
      // Rollback : retirer le folder temporaire en cas d'erreur
      setFolders((prev) => prev.filter((f) => f.id !== tempId));
      console.error("Failed to create folder");
    }
  }, []);

  const handleRenameFolder = useCallback(async (id: string, newName: string) => {
    // Optimistic update + override pour le polling
    folderNameOverrides.current.set(id, newName);
    setFolders((prev) =>
      prev.map((f) => (f.id === id ? { ...f, name: newName } : f))
    );
    try {
      const ok = await renameFolderAction(id, newName);
      if (ok) {
        setTimeout(() => folderNameOverrides.current.delete(id), 6000);
      }
    } catch {
      console.error("Failed to rename folder");
      folderNameOverrides.current.delete(id);
    }
  }, []);

  const handleDeleteFolder = useCallback(async (id: string) => {
    // Sauvegarder l'état avant pour rollback potentiel
    const prevFolders = folders;
    const folder = folders.find((f) => f.id === id);

    // Optimistic : retirer immédiatement du state
    setFolders((prev) => prev.filter((f) => f.id !== id));
    setAgents((prev) =>
      prev.map((a) => (a.folderId === id ? { ...a, folderId: undefined } : a))
    );
    if (folder) toastFolderDeleted(folder.name);

    try {
      const ok = await deleteFolderAction(id);
      if (!ok) {
        // Rollback si le serveur refuse
        setFolders(prevFolders);
      }
    } catch {
      // Rollback en cas d'erreur réseau
      setFolders(prevFolders);
      console.error("Failed to delete folder");
    }
  }, [folders]);

  const handleAssignAgent = useCallback(async (agentId: string, folderId: string | undefined) => {
    // Optimistic update
    setAgents((prev) =>
      prev.map((a) => (a.id === agentId ? { ...a, folderId } : a))
    );
    // Server Action pour persister
    await assignAgentAction(agentId, folderId ?? null);
  }, []);

  // IDs des agents visibles dans les panels (pour highlight sidebar)
  const selectedIds = panels.filter((id): id is string => id !== null);

  // La grille remplit exactement l'espace restant — jamais plus, jamais moins.
  // h-full + overflow-hidden empêche le contenu des panels de pousser la grille.
  const gridClass = cn(
    "h-full grid gap-px bg-noir-border overflow-hidden",
    layoutMode === 1 && "grid-cols-1 grid-rows-1",
    layoutMode === 2 && "grid-cols-2 grid-rows-1",
    layoutMode === 4 && "grid-cols-2 grid-rows-[1fr_1fr]",
  );

  return (
    <div className="flex h-screen flex-col bg-noir overflow-hidden">
      <Header
        agentCount={agents.filter((a) => a.status === "running").length}
        onSpawn={() => setShowSpawn(true)}
      />

      <StatsCards agents={agents} />

      {/* Zone principale — min-h-0 permet au flex-1 de shrink sous la taille du contenu */}
      <div className="mx-auto flex w-full max-w-[1920px] flex-1 min-h-0 gap-0">
        {/* Sidebar — largeur contrôlée par le resize handle */}
        <div
          className="flex-shrink-0 overflow-hidden border-r border-noir-border"
          style={{ width: sidebarWidth }}
        >
          <AgentSidebar
            agents={agents}
            folders={folders}
            selectedIds={selectedIds}
            onSelect={selectAgent}
            onSpawn={() => setShowSpawn(true)}
            onRename={renameAgent}
            onCreateFolder={handleCreateFolder}
            onRenameFolder={handleRenameFolder}
            onDeleteFolder={handleDeleteFolder}
            onAssignAgent={handleAssignAgent}
          />
        </div>

        {/* Resize handle — barre fine entre sidebar et panels */}
        <div
          onMouseDown={startResize}
          className={cn(
            "w-1 flex-shrink-0 cursor-col-resize transition-colors duration-150",
            isResizing ? "bg-neon/30" : "hover:bg-neon/20"
          )}
        />

        {/* Panels zone — flex-col + min-h-0 pour que la grille ne déborde pas */}
        <div className="flex flex-1 min-h-0 flex-col">
          {/* ─── Layout switcher ─── */}
          <div className="flex items-center justify-end border-b border-noir-border px-4 py-1.5">
            <div className="flex items-center gap-0.5">
              {([
                { mode: 1 as LayoutMode, icon: Maximize, label: "Single" },
                { mode: 2 as LayoutMode, icon: Columns2, label: "Split" },
                { mode: 4 as LayoutMode, icon: Grid2X2, label: "Quad" },
              ]).map(({ mode, icon: Icon, label }) => (
                <motion.button
                  key={mode}
                  onClick={() => changeLayout(mode)}
                  whileTap={{ scale: 0.9 }}
                  title={label}
                  className={cn(
                    "flex h-6 w-6 items-center justify-center transition-colors",
                    layoutMode === mode
                      ? "text-neon"
                      : "text-warm-500 hover:text-warm-300"
                  )}
                >
                  <Icon className="h-3.5 w-3.5" />
                </motion.button>
              ))}
            </div>
          </div>

          {/* ─── Multi-panel grid ─── */}
          <div className={gridClass}>
            {panels.map((agentId, idx) => {
              const agent = agentId
                ? agents.find((a) => a.id === agentId) ?? null
                : null;
              const isFocused = focusedPanel === idx && layoutMode > 1;

              return (
                <div
                  key={idx}
                  onClick={() => setFocusedPanel(idx)}
                  // ─── Drop zone : accepter les agents droppés ici ───
                  onDragOver={(e: DragEvent) => {
                    e.preventDefault();
                    setDragOverPanel(idx);
                  }}
                  onDragLeave={() => setDragOverPanel(null)}
                  onDrop={(e: DragEvent) => {
                    e.preventDefault();
                    setDragOverPanel(null);
                    const droppedId = e.dataTransfer.getData("agent-id");
                    if (droppedId) {
                      setPanels((prev) => {
                        const newPanels = [...prev];
                        // Si l'agent est déjà dans un autre panel, le retirer de là
                        const existingIdx = newPanels.indexOf(droppedId);
                        if (existingIdx !== -1 && existingIdx !== idx) {
                          newPanels[existingIdx] = null;
                        }
                        newPanels[idx] = droppedId;
                        return newPanels;
                      });
                      setFocusedPanel(idx);
                    }
                  }}
                  className={cn(
                    "relative bg-noir min-h-0 overflow-hidden cursor-default transition-all",
                    isFocused && "ring-1 ring-inset ring-neon/25",
                    dragOverPanel === idx && "ring-2 ring-inset ring-neon/50 bg-neon/[0.02]"
                  )}
                >
                  {/* Indicateur focus ou drop */}
                  {(isFocused || dragOverPanel === idx) && (
                    <div className={cn(
                      "absolute top-0 left-0 right-0 h-px z-10",
                      dragOverPanel === idx ? "bg-neon/70" : "bg-neon/40"
                    )} />
                  )}
                  <AgentDetailPanel
                    agent={agent}
                    onStop={stopAgent}
                    onResume={resumeAgent}
                    onSpawn={() => { setFocusedPanel(idx); setShowSpawn(true); }}
                    onClose={layoutMode > 1 ? () => closePanel(idx) : undefined}
                    compact={layoutMode > 1}
                  />
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {showSpawn && (
        <SpawnDialog
          onSpawn={spawnAgent}
          onClose={() => setShowSpawn(false)}
          folders={folders}
        />
      )}
    </div>
  );
}
