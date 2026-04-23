"use client";

import { useState, useEffect, useMemo, useCallback, memo, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  X,
  ArrowRight,
  Search,
  Shield,
  Bug,
  Sparkles,
  FlaskConical,
  Zap,
  FileText,
  Terminal,
  History,
  Plus,
  Folder as FolderIcon,
  FolderOpen,
  ListPlus,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { AGENT_PRESETS, type AgentPreset } from "@/lib/agent-presets";
import { DirectoryBrowser } from "./directory-browser";
import type { SpawnTask, Folder } from "@/lib/agent-orchestrator";

interface SpawnDialogProps {
  onSpawn: (task: SpawnTask) => void;
  onClose: () => void;
  folders: Folder[];
  /** Si fourni, ajoute un bouton "Queue" qui empile la tâche au lieu de spawn direct */
  onQueue?: (task: SpawnTask) => void;
}

interface SessionInfo {
  id: string;
  project: string;
  cwd: string;
  sizeBytes: number;
  lastModified: string;
  preview: string;
}

const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  Search, Shield, Bug, Sparkles, FlaskConical, Zap, FileText, Terminal,
};

const PERMISSION_MODES = [
  { value: "acceptEdits", label: "Accept Edits", desc: "Auto-approve file edits" },
  { value: "default", label: "Default", desc: "Prompt for dangerous ops" },
  { value: "bypassPermissions", label: "Bypass All", desc: "No permission checks" },
  { value: "plan", label: "Plan Only", desc: "No tool execution" },
  { value: "dontAsk", label: "Don't Ask", desc: "Deny if not pre-approved" },
] as const;

/** Grille de presets isolée — memo pour éviter re-renders sur frappe */
const PresetGrid = memo(function PresetGrid({
  selectedPreset,
  onSelect,
}: {
  selectedPreset: string | null;
  onSelect: (preset: AgentPreset) => void;
}) {
  return (
    <div className="grid grid-cols-4 gap-1.5">
      {AGENT_PRESETS.map((preset) => {
        const Icon = ICON_MAP[preset.icon] || Terminal;
        const isActive = selectedPreset === preset.id;
        return (
          <motion.button
            key={preset.id}
            type="button"
            onClick={() => onSelect(preset)}
            whileTap={{ scale: 0.97 }}
            className={cn(
              "flex flex-col items-center gap-2 border py-3 px-2 transition-all",
              isActive
                ? "border-neon/30 bg-neon/5"
                : "border-noir-border bg-noir-card hover:border-noir-border-light hover:bg-noir-elevated"
            )}
          >
            <Icon className={cn("h-4 w-4", isActive ? "text-neon" : "text-warm-500")} />
            <span className={cn("font-mono text-[9px] uppercase tracking-wider", isActive ? "text-neon/80" : "text-warm-400")}>
              {preset.name}
            </span>
          </motion.button>
        );
      })}
    </div>
  );
});

/** Formater une date ISO en format relatif compact */
function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function SpawnDialog({ onSpawn, onClose, folders, onQueue }: SpawnDialogProps) {
  // ─── Tabs : "new" ou "resume" ───
  const [tab, setTab] = useState<"new" | "resume">("new");

  // ─── New agent state (initialisé depuis les settings) ───
  const [selectedPreset, setSelectedPreset] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [prompt, setPrompt] = useState("");
  // Tools par défaut — gérés automatiquement par le SDK selon le permission mode
  const DEFAULT_TOOLS = ["Read", "Edit", "Write", "Glob", "Grep", "Bash"];
  const [directory, setDirectory] = useState("");
  const [model, setModel] = useState("");
  const [loadSettings, setLoadSettings] = useState(true);
  const [maxBudget, setMaxBudget] = useState("");
  const [permissionMode, setPermissionMode] = useState<string>("acceptEdits");
  const [folderId, setFolderId] = useState<string>("");
  const [showBrowser, setShowBrowser] = useState(false);
  /** Loading state pendant le spawn — feedback visuel bref */
  const [spawning, setSpawning] = useState(false);
  const spawningTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Charger les settings par défaut au mount
  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then((s) => {
        if (s.defaultModel) setModel(s.defaultModel);
        if (s.defaultPermissionMode) setPermissionMode(s.defaultPermissionMode);
        if (s.defaultWorkingDirectory) setDirectory(s.defaultWorkingDirectory);
        if (s.loadClaudeMd !== undefined) setLoadSettings(s.loadClaudeMd);
      })
      .catch(() => {});
  }, []);

  // ─── Resume session state ───
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [loadingSessions, setLoadingSessions] = useState(false);
  const [sessionFilter, setSessionFilter] = useState("");

  // Charger les sessions quand on ouvre l'onglet resume
  useEffect(() => {
    if (tab !== "resume") return;
    setLoadingSessions(true);
    fetch("/api/sessions")
      .then((r) => r.json())
      .then((data) => setSessions(data.sessions ?? []))
      .catch(() => setSessions([]))
      .finally(() => setLoadingSessions(false));
  }, [tab]);

  // Sessions filtrées par la recherche
  const filteredSessions = useMemo(() => {
    if (!sessionFilter) return sessions;
    const q = sessionFilter.toLowerCase();
    return sessions.filter(
      (s) => s.project.toLowerCase().includes(q) || s.preview.toLowerCase().includes(q)
    );
  }, [sessions, sessionFilter]);

  const selectPreset = useCallback((preset: AgentPreset) => {
    setSelectedPreset(preset.id);
    setName(preset.name);
    setPrompt(preset.prompt);
  }, []);

  /** Spawn un nouvel agent — si aucun preset ni prompt, lance une instance Claude Code vanilla */
  const handleSubmitNew = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    if (spawning) return;
    setSpawning(true);
    const agentName = name.trim() || "Claude Code";
    const agentPrompt = prompt.trim() || "You are Claude Code. Help the user with their coding tasks. Wait for instructions.";
    onSpawn({
      name: agentName,
      prompt: agentPrompt,
      tools: DEFAULT_TOOLS,
      workingDirectory: directory.trim() || undefined,
      model: model || undefined,
      loadSettings,
      maxBudgetUsd: maxBudget ? parseFloat(maxBudget) : undefined,
      permissionMode: permissionMode as SpawnTask["permissionMode"],
      folderId: folderId || undefined,
    });
    spawningTimer.current = setTimeout(() => setSpawning(false), 1500);
  }, [name, prompt, directory, model, loadSettings, maxBudget, permissionMode, folderId, onSpawn, spawning]);

  /** Ajouter la tâche à la queue au lieu de spawn direct */
  const handleQueue = useCallback(() => {
    if (!onQueue) return;
    const agentName = name.trim() || "Claude Code";
    const agentPrompt = prompt.trim() || "You are Claude Code. Help the user with their coding tasks. Wait for instructions.";
    onQueue({
      name: agentName,
      prompt: agentPrompt,
      tools: DEFAULT_TOOLS,
      workingDirectory: directory.trim() || undefined,
      model: model || undefined,
      loadSettings,
      maxBudgetUsd: maxBudget ? parseFloat(maxBudget) : undefined,
      permissionMode: permissionMode as SpawnTask["permissionMode"],
      folderId: folderId || undefined,
    });
    onClose();
  }, [name, prompt, directory, model, loadSettings, maxBudget, permissionMode, folderId, onQueue, onClose]);

  // Cleanup timer au unmount
  useEffect(() => {
    return () => { if (spawningTimer.current) clearTimeout(spawningTimer.current); };
  }, []);

  /** Reprendre une session existante */
  const handleResumeSession = useCallback((session: SessionInfo) => {
    onSpawn({
      name: `Resume: ${session.project.replace(/^C--/, "").replace(/-/g, "/")}`,
      prompt: "Continue where we left off. What were we working on?",
      tools: ["Read", "Edit", "Write", "Glob", "Grep", "Bash"],
      workingDirectory: session.cwd,
      loadSettings: true,
      resumeSessionId: session.id,
      permissionMode: "acceptEdits",
    });
  }, [onSpawn]);

  /** Continuer la dernière session dans un directory */
  const handleContinueLast = useCallback((cwd: string) => {
    onSpawn({
      name: `Continue: ${cwd.split("/").pop() || cwd}`,
      prompt: "Continue where we left off.",
      tools: ["Read", "Edit", "Write", "Glob", "Grep", "Bash"],
      workingDirectory: cwd,
      loadSettings: true,
      continueLastSession: true,
      permissionMode: "acceptEdits",
    });
  }, [onSpawn]);

  return (
    <AnimatePresence>
      {/* Overlay — cliquable pour fermer */}
      <motion.div
        key="spawn-overlay"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="fixed inset-0 z-50 bg-black/60"
      />

      {/* Sidebar panel — slide depuis la droite */}
      <motion.div
        key="spawn-panel"
        initial={{ x: "100%" }}
        animate={{ x: 0 }}
        exit={{ x: "100%" }}
        transition={{ type: "spring", damping: 30, stiffness: 300 }}
        className="fixed right-0 top-0 bottom-0 z-50 w-[420px] max-w-[85vw] overflow-y-auto border-l border-noir-border bg-noir-surface shadow-2xl shadow-black/40 custom-scrollbar"
      >
        {/* ─── Header avec tabs ─── */}
        <div className="flex items-center justify-between border-b border-noir-border px-6 py-3">
          <div className="flex items-center gap-1">
            <button
              onClick={() => setTab("new")}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 font-mono text-[11px] transition-colors",
                tab === "new"
                  ? "text-neon border-b-2 border-neon"
                  : "text-warm-500 hover:text-warm-300"
              )}
            >
              <Plus className="h-3 w-3" />
              New Agent
            </button>
            <button
              onClick={() => setTab("resume")}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 font-mono text-[11px] transition-colors",
                tab === "resume"
                  ? "text-neon border-b-2 border-neon"
                  : "text-warm-500 hover:text-warm-300"
              )}
            >
              <History className="h-3 w-3" />
              Resume Session
            </button>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-warm-500 transition-colors hover:text-warm-200"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* ═══════ TAB: NEW AGENT ═══════ */}
        {tab === "new" && (
          <form onSubmit={handleSubmitNew}>
            <div className="space-y-5 p-6">
              {/* Presets */}
              <div>
                <label className="mb-3 block font-mono text-[10px] uppercase tracking-[0.2em] text-warm-500">
                  Presets
                </label>
                <PresetGrid selectedPreset={selectedPreset} onSelect={selectPreset} />
              </div>

              <div className="divider" />

              {/* Name */}
              <div>
                <label htmlFor="agent-name" className="mb-1.5 block font-mono text-[10px] uppercase tracking-[0.2em] text-warm-500">
                  Name
                </label>
                <input id="agent-name" type="text" value={name} onChange={(e) => setName(e.target.value)}
                  placeholder="Claude Code" className="input-noir w-full rounded-none px-3 py-2 font-body text-sm" />
              </div>

              {/* Prompt */}
              <div>
                <label htmlFor="agent-prompt" className="mb-1.5 block font-mono text-[10px] uppercase tracking-[0.2em] text-warm-500">
                  Prompt
                </label>
                <textarea id="agent-prompt" value={prompt} onChange={(e) => setPrompt(e.target.value)}
                  placeholder="Optional — leave empty for a vanilla Claude Code instance" rows={3}
                  className="input-noir w-full resize-none rounded-none px-3 py-2 font-body text-sm leading-relaxed" />
              </div>

              {/* Permission Mode */}
              <div>
                <label className="mb-2 block font-mono text-[10px] uppercase tracking-[0.2em] text-warm-500">
                  Permission Mode
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {PERMISSION_MODES.map((mode) => (
                    <button
                      key={mode.value}
                      type="button"
                      onClick={() => setPermissionMode(mode.value)}
                      title={mode.desc}
                      className={cn(
                        "border px-2.5 py-1 font-mono text-[10px] transition-all",
                        permissionMode === mode.value
                          ? mode.value === "bypassPermissions"
                            ? "border-status-error/30 bg-status-error/8 text-status-error"
                            : "border-neon/30 bg-neon/8 text-neon"
                          : "border-noir-border bg-noir-card text-warm-500 hover:border-noir-border-light hover:text-warm-300"
                      )}
                    >
                      {mode.label}
                    </button>
                  ))}
                </div>
                {permissionMode === "bypassPermissions" && (
                  <p className="mt-1.5 font-mono text-[9px] text-status-error/70">
                    bypass all permission checks — use only in sandboxed environments
                  </p>
                )}
              </div>

              {/* Directory + Model + Budget */}
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label htmlFor="agent-dir" className="mb-1.5 block font-mono text-[10px] uppercase tracking-[0.2em] text-warm-500">
                    Working Directory <span className="normal-case text-warm-600">(optional)</span>
                  </label>
                  {/* Input + bouton browse */}
                  <div className="flex gap-1.5">
                    <input id="agent-dir" type="text" value={directory} onChange={(e) => setDirectory(e.target.value)}
                      placeholder="/path/to/project" className="input-noir min-w-0 flex-1 rounded-none px-3 py-2 font-mono text-xs" />
                    <motion.button
                      type="button"
                      onClick={() => setShowBrowser((v) => !v)}
                      whileTap={{ scale: 0.95 }}
                      className={cn(
                        "flex h-[34px] flex-shrink-0 items-center justify-center gap-1.5 border transition-all",
                        /* Largeur dynamique : icone seule si pas de path, sinon on affiche le nom du dossier */
                        directory.trim() ? "max-w-[140px] px-2" : "w-[34px]",
                        showBrowser
                          ? "border-neon/30 bg-neon/8 text-neon"
                          : "border-noir-border bg-noir-card text-warm-500 hover:border-noir-border-light hover:text-warm-300"
                      )}
                      title={directory.trim() || "Browse directories"}
                    >
                      <FolderOpen className="h-3.5 w-3.5 flex-shrink-0" />
                      {/* Affiche le dernier segment du path quand un directory est selectionne */}
                      {directory.trim() && (
                        <span className="truncate font-mono text-[9px]">
                          {directory.trim().replace(/\\/g, "/").split("/").filter(Boolean).pop()}
                        </span>
                      )}
                    </motion.button>
                  </div>
                  {/* Directory browser inline */}
                  <AnimatePresence>
                    {showBrowser && (
                      <DirectoryBrowser
                        currentPath={directory}
                        onSelect={(path) => setDirectory(path)}
                        onClose={() => setShowBrowser(false)}
                      />
                    )}
                  </AnimatePresence>
                </div>
                <div>
                  <label htmlFor="agent-model" className="mb-1.5 block font-mono text-[10px] uppercase tracking-[0.2em] text-warm-500">
                    Model <span className="normal-case text-warm-600">(optional)</span>
                  </label>
                  <select id="agent-model" value={model} onChange={(e) => setModel(e.target.value)}
                    className="input-noir w-full rounded-none px-3 py-2 font-mono text-xs">
                    <option value="">default</option>
                    <option value="claude-opus-4-6">Opus 4.6</option>
                    <option value="claude-sonnet-4-6">Sonnet 4.6</option>
                    <option value="claude-haiku-4-5-20251001">Haiku 4.5</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="agent-budget" className="mb-1.5 block font-mono text-[10px] uppercase tracking-[0.2em] text-warm-500">
                    Max Budget <span className="normal-case text-warm-600">(optional)</span>
                  </label>
                  <input id="agent-budget" type="number" step="0.1" min="0" value={maxBudget}
                    onChange={(e) => setMaxBudget(e.target.value)} placeholder="$5.00"
                    className="input-noir w-full rounded-none px-3 py-2 font-mono text-xs" />
                </div>
              </div>

              {/* Folder (optional) */}
              {folders.length > 0 && (
                <div>
                  <label htmlFor="agent-folder" className="mb-1.5 block font-mono text-[10px] uppercase tracking-[0.2em] text-warm-500">
                    Folder <span className="normal-case text-warm-600">(optional)</span>
                  </label>
                  <select
                    id="agent-folder"
                    value={folderId}
                    onChange={(e) => setFolderId(e.target.value)}
                    className="input-noir w-full rounded-none px-3 py-2 font-mono text-xs"
                  >
                    <option value="">No folder</option>
                    {folders.map((f) => (
                      <option key={f.id} value={f.id}>{f.name}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* Settings toggle */}
              <button type="button" onClick={() => setLoadSettings((v) => !v)} className="flex items-center gap-2.5 font-mono text-[11px]">
                <span className={cn("flex h-4 w-7 items-center rounded-full border p-0.5 transition-colors",
                  loadSettings ? "border-neon/30 bg-neon/15" : "border-noir-border bg-noir-card")}>
                  <span className={cn("h-2.5 w-2.5 rounded-full transition-all",
                    loadSettings ? "translate-x-2.5 bg-neon" : "translate-x-0 bg-warm-500")} />
                </span>
                <span className={loadSettings ? "text-warm-200" : "text-warm-500"}>
                  Load CLAUDE.md &amp; user settings
                </span>
              </button>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end gap-3 border-t border-noir-border px-6 py-4">
              <button type="button" onClick={onClose}
                className="border border-noir-border px-4 py-2 font-mono text-[11px] text-warm-400 transition-colors hover:border-noir-border-light hover:text-warm-200">
                cancel
              </button>
              {/* Bouton Queue — empile la tâche pour exécution séquentielle */}
              {onQueue && (
                <motion.button
                  type="button"
                  onClick={handleQueue}
                  disabled={spawning}
                  whileTap={{ scale: 0.98 }}
                  className="group flex items-center gap-2 border border-amber-500/30 bg-amber-500/8 px-5 py-2 font-mono text-[11px] font-medium text-amber-400 transition-all hover:border-amber-500/50 hover:bg-amber-500/12 disabled:cursor-not-allowed disabled:opacity-30"
                >
                  queue
                  <ListPlus className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
                </motion.button>
              )}
              <motion.button type="submit" disabled={spawning}
                whileTap={{ scale: 0.98 }}
                className="group flex items-center gap-2 border border-neon/30 bg-neon/8 px-5 py-2 font-mono text-[11px] font-medium text-neon transition-all hover:border-neon/50 hover:bg-neon/12 disabled:cursor-not-allowed disabled:opacity-30">
                {spawning ? "spawning" : "spawn"}
                {spawning ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
                )}
              </motion.button>
            </div>
          </form>
        )}

        {/* ═══════ TAB: RESUME SESSION ═══════ */}
        {tab === "resume" && (
          <div className="p-6">
            {/* Barre de recherche */}
            <div className="mb-4">
              <input
                type="text"
                value={sessionFilter}
                onChange={(e) => setSessionFilter(e.target.value)}
                placeholder="Search sessions..."
                className="input-noir w-full rounded-none px-3 py-2 font-mono text-xs"
              />
            </div>

            {/* Liste des sessions */}
            <div className="custom-scrollbar max-h-[60vh] space-y-1 overflow-y-auto">
              {loadingSessions ? (
                <div className="py-12 text-center font-mono text-xs text-warm-500">
                  scanning ~/.claude/projects...
                </div>
              ) : filteredSessions.length === 0 ? (
                <div className="py-12 text-center font-mono text-xs text-warm-500">
                  {sessionFilter ? "no matching sessions" : "no sessions found"}
                </div>
              ) : (
                filteredSessions.map((session) => (
                  <motion.button
                    key={session.id}
                    onClick={() => handleResumeSession(session)}
                    whileTap={{ scale: 0.99 }}
                    className="group flex w-full items-start gap-3 border border-noir-border bg-noir-card px-4 py-3 text-left transition-all hover:border-noir-border-light hover:bg-noir-elevated"
                  >
                    <FolderIcon className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-warm-500 group-hover:text-neon/60" />
                    <div className="min-w-0 flex-1">
                      {/* Nom du projet */}
                      <div className="flex items-center gap-2">
                        <span className="truncate font-mono text-xs text-warm-200">
                          {session.project.replace(/^C--/, "").replace(/-/g, "/")}
                        </span>
                        <span className="flex-shrink-0 font-mono text-[9px] text-warm-600">
                          {relativeTime(session.lastModified)}
                        </span>
                      </div>
                      {/* Preview du premier message */}
                      <p className="mt-1 truncate font-mono text-[10px] text-warm-500">
                        {session.preview}
                      </p>
                      {/* Session ID + taille */}
                      <div className="mt-1 flex items-center gap-2 font-mono text-[9px] text-warm-600">
                        <span>{session.id.slice(0, 8)}</span>
                        <span>·</span>
                        <span>{(session.sizeBytes / 1024).toFixed(0)}KB</span>
                      </div>
                    </div>
                    <ArrowRight className="mt-1 h-3 w-3 flex-shrink-0 text-warm-600 opacity-0 transition-opacity group-hover:opacity-100" />
                  </motion.button>
                ))
              )}
            </div>
          </div>
        )}
      </motion.div>
    </AnimatePresence>
  );
}
