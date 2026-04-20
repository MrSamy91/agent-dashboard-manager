"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft,
  Check,
  Loader2,
  Monitor,
  Cpu,
  Key,
  AlertTriangle,
  RotateCcw,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";

/* ─── Types ──────────────────────────────────────────────────── */

interface Settings {
  defaultModel: string;
  defaultPermissionMode: string;
  defaultWorkingDirectory: string;
  loadClaudeMd: boolean;
  pollingInterval: number;
  terminalFontSize: string;
  agentMode: string;
  apiKeyOverride: string;
}

interface ConnectionStatus {
  mode: string;
  connected: boolean;
  email: string | null;
  subscription: string | null;
}

/* ─── Options pour les selectors ─────────────────────────────── */

const MODEL_OPTIONS = [
  { value: "", label: "Default" },
  { value: "claude-opus-4-6", label: "Opus 4.6" },
  { value: "claude-sonnet-4-6", label: "Sonnet 4.6" },
  { value: "claude-haiku-4-5-20251001", label: "Haiku 4.5" },
];

const PERMISSION_MODES = [
  { value: "acceptEdits", label: "Accept Edits", desc: "Auto-approve file edits" },
  { value: "default", label: "Default", desc: "Prompt for dangerous ops" },
  { value: "bypassPermissions", label: "Bypass All", desc: "No permission checks" },
  { value: "plan", label: "Plan Only", desc: "No tool execution" },
  { value: "dontAsk", label: "Don't Ask", desc: "Deny if not pre-approved" },
];

const POLLING_OPTIONS = [
  { value: 3000, label: "3s" },
  { value: 5000, label: "5s" },
  { value: 10000, label: "10s" },
];

const FONT_SIZE_OPTIONS = [
  { value: "xs", label: "XS" },
  { value: "sm", label: "SM" },
  { value: "base", label: "Base" },
];

/* ─── Animations Framer Motion ───────────────────────────────── */

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.05 },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0 },
};

/* ─── Composant principal ────────────────────────────────────── */

export function SettingsPage() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [status, setStatus] = useState<ConnectionStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ─── Charger les settings et le statut au mount ───
  useEffect(() => {
    Promise.all([
      fetch("/api/settings").then((r) => r.json()),
      fetch("/api/status").then((r) => r.json()),
    ])
      .then(([settingsData, statusData]) => {
        setSettings(settingsData);
        setStatus(statusData);
      })
      .catch(() => setError("Failed to load settings"))
      .finally(() => setLoading(false));
  }, []);

  /**
   * Sauvegarder les settings via PUT /api/settings.
   * Affiche un feedback visuel (check icon) pendant 2 secondes.
   */
  const save = useCallback(
    async (newSettings: Settings) => {
      setSaving(true);
      setSaved(false);
      setError(null);
      try {
        const res = await fetch("/api/settings", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(newSettings),
        });
        if (!res.ok) throw new Error("Save failed");
        const data = await res.json();
        setSettings(data);
        setSaved(true);
        // Reset le feedback apres 2 secondes
        setTimeout(() => setSaved(false), 2000);
      } catch {
        setError("Failed to save settings");
      } finally {
        setSaving(false);
      }
    },
    []
  );

  /**
   * Helper pour mettre a jour un champ et sauvegarder automatiquement.
   * Evite la repetition dans chaque handler d'input.
   */
  const updateField = useCallback(
    <K extends keyof Settings>(key: K, value: Settings[K]) => {
      if (!settings) return;
      const updated = { ...settings, [key]: value };
      setSettings(updated);
      save(updated);
    },
    [settings, save]
  );

  /** Clear tous les agents via DELETE de chaque agent */
  const clearAllAgents = useCallback(async () => {
    if (!confirm("Clear all agents? This cannot be undone.")) return;
    try {
      const res = await fetch("/api/agents");
      const data = await res.json();
      // Supprimer chaque agent individuellement
      await Promise.all(
        (data.agents as { id: string }[]).map((a) =>
          fetch(`/api/agents/${a.id}`, { method: "DELETE" })
        )
      );
    } catch {
      setError("Failed to clear agents");
    }
  }, []);

  /** Reset tous les settings aux valeurs par defaut */
  const resetSettings = useCallback(async () => {
    if (!confirm("Reset all settings to default? This cannot be undone.")) return;
    try {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        // Envoyer un objet vide force le serveur a utiliser les defaults
        body: JSON.stringify({
          defaultModel: "",
          defaultPermissionMode: "acceptEdits",
          defaultWorkingDirectory: "",
          loadClaudeMd: true,
          pollingInterval: 5000,
          terminalFontSize: "sm",
          agentMode: "mock",
          apiKeyOverride: "",
        }),
      });
      if (!res.ok) throw new Error("Reset failed");
      const data = await res.json();
      setSettings(data);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {
      setError("Failed to reset settings");
    }
  }, []);

  // ─── Loading state ───
  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-noir">
        <Loader2 className="h-5 w-5 animate-spin text-warm-500" />
      </div>
    );
  }

  if (!settings) {
    return (
      <div className="flex h-screen items-center justify-center bg-noir">
        <p className="font-mono text-xs text-status-error">
          {error || "Failed to load settings"}
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col bg-noir overflow-hidden">
      {/* ═══════ Header ═══════ */}
      <header className="relative border-b border-noir-border">
        <div className="mx-auto flex h-14 max-w-[1600px] items-center justify-between px-8">
          {/* Retour au dashboard + titre */}
          <div className="flex items-center gap-4">
            <Link
              href="/"
              className="flex items-center gap-2 text-warm-500 transition-colors hover:text-warm-200"
            >
              <ArrowLeft className="h-4 w-4" />
              <span className="font-mono text-[11px]">dashboard</span>
            </Link>
            <div className="h-4 w-px bg-noir-border" />
            <h1 className="font-display text-xl tracking-tight text-warm-100">
              Settings
            </h1>
          </div>

          {/* Indicateur de sauvegarde */}
          <AnimatePresence mode="wait">
            {saving && (
              <motion.div
                key="saving"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex items-center gap-2 font-mono text-[10px] text-warm-500"
              >
                <Loader2 className="h-3 w-3 animate-spin" />
                saving...
              </motion.div>
            )}
            {saved && !saving && (
              <motion.div
                key="saved"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0 }}
                className="flex items-center gap-2 font-mono text-[10px] text-neon"
              >
                <Check className="h-3 w-3" />
                saved
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </header>

      {/* ═══════ Content ═══════ */}
      <div className="flex-1 overflow-y-auto custom-scrollbar">
        <motion.div
          variants={containerVariants}
          initial="hidden"
          animate="visible"
          className="mx-auto max-w-2xl space-y-8 px-8 py-8"
        >
          {/* Erreur globale */}
          {error && (
            <motion.div
              variants={itemVariants}
              className="flex items-center gap-2 border border-status-error/30 bg-status-error/5 px-4 py-3 font-mono text-xs text-status-error"
            >
              <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0" />
              {error}
            </motion.div>
          )}

          {/* ─────────────────────────────────────────────────
             Section 1 : General
             ───────────────────────────────────────────────── */}
          <motion.section variants={itemVariants}>
            <SectionHeader icon={Cpu} title="General" />
            <div className="mt-4 space-y-5 rounded-none border border-noir-border bg-noir-surface p-6">
              {/* Default model */}
              <SettingRow label="Default Model">
                <select
                  value={settings.defaultModel}
                  onChange={(e) => updateField("defaultModel", e.target.value)}
                  className="input-noir w-full rounded-none px-3 py-2 font-mono text-xs"
                >
                  {MODEL_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </SettingRow>

              <div className="divider" />

              {/* Default permission mode */}
              <SettingRow label="Default Permission Mode">
                <div className="flex flex-wrap gap-1.5">
                  {PERMISSION_MODES.map((mode) => (
                    <button
                      key={mode.value}
                      onClick={() =>
                        updateField("defaultPermissionMode", mode.value)
                      }
                      title={mode.desc}
                      className={cn(
                        "border px-2.5 py-1 font-mono text-[10px] transition-all",
                        settings.defaultPermissionMode === mode.value
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
              </SettingRow>

              <div className="divider" />

              {/* Default working directory */}
              <SettingRow label="Default Working Directory">
                <input
                  type="text"
                  value={settings.defaultWorkingDirectory}
                  onChange={(e) =>
                    updateField("defaultWorkingDirectory", e.target.value)
                  }
                  placeholder="/path/to/project"
                  className="input-noir w-full rounded-none px-3 py-2 font-mono text-xs"
                />
              </SettingRow>

              <div className="divider" />

              {/* Load CLAUDE.md toggle */}
              <SettingRow label="Load CLAUDE.md by default">
                <Toggle
                  checked={settings.loadClaudeMd}
                  onChange={(v) => updateField("loadClaudeMd", v)}
                />
              </SettingRow>
            </div>
          </motion.section>

          {/* ─────────────────────────────────────────────────
             Section 2 : Appearance
             ───────────────────────────────────────────────── */}
          <motion.section variants={itemVariants}>
            <SectionHeader icon={Monitor} title="Appearance" />
            <div className="mt-4 space-y-5 rounded-none border border-noir-border bg-noir-surface p-6">
              {/* Polling interval */}
              <SettingRow label="Polling Interval">
                <div className="flex gap-1.5">
                  {POLLING_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() =>
                        updateField("pollingInterval", opt.value)
                      }
                      className={cn(
                        "border px-3 py-1.5 font-mono text-[10px] transition-all",
                        settings.pollingInterval === opt.value
                          ? "border-neon/30 bg-neon/8 text-neon"
                          : "border-noir-border bg-noir-card text-warm-500 hover:border-noir-border-light hover:text-warm-300"
                      )}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </SettingRow>

              <div className="divider" />

              {/* Terminal font size */}
              <SettingRow label="Terminal Font Size">
                <div className="flex gap-1.5">
                  {FONT_SIZE_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() =>
                        updateField("terminalFontSize", opt.value)
                      }
                      className={cn(
                        "border px-3 py-1.5 font-mono text-[10px] transition-all",
                        settings.terminalFontSize === opt.value
                          ? "border-neon/30 bg-neon/8 text-neon"
                          : "border-noir-border bg-noir-card text-warm-500 hover:border-noir-border-light hover:text-warm-300"
                      )}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </SettingRow>
            </div>
          </motion.section>

          {/* ─────────────────────────────────────────────────
             Section 3 : API & Connection
             ───────────────────────────────────────────────── */}
          <motion.section variants={itemVariants}>
            <SectionHeader icon={Key} title="API & Connection" />
            <div className="mt-4 space-y-5 rounded-none border border-noir-border bg-noir-surface p-6">
              {/* Auth status (read-only) */}
              <SettingRow label="Auth Status">
                <div className="flex items-center gap-3 font-mono text-xs">
                  {status ? (
                    <>
                      {/* Dot indicateur connecte / deconnecte */}
                      <span
                        className={cn(
                          "h-2 w-2 rounded-full",
                          status.connected
                            ? "bg-neon"
                            : status.mode === "mock"
                              ? "bg-status-stopped"
                              : "bg-status-error"
                        )}
                      />
                      {status.connected ? (
                        <div className="flex items-center gap-2">
                          <span className="text-warm-200">
                            {status.email}
                          </span>
                          <span className="text-warm-600">&middot;</span>
                          <span className="uppercase text-warm-500">
                            {status.subscription}
                          </span>
                        </div>
                      ) : (
                        <span
                          className={
                            status.mode === "mock"
                              ? "text-status-stopped"
                              : "text-status-error"
                          }
                        >
                          {status.mode === "mock"
                            ? "mock mode"
                            : "not connected"}
                        </span>
                      )}
                    </>
                  ) : (
                    <span className="text-warm-500">loading...</span>
                  )}
                </div>
              </SettingRow>

              <div className="divider" />

              {/* Agent mode toggle (mock / real) */}
              <SettingRow label="Agent Mode">
                <div className="flex gap-1.5">
                  {(["mock", "real"] as const).map((mode) => (
                    <button
                      key={mode}
                      onClick={() => updateField("agentMode", mode)}
                      className={cn(
                        "border px-3 py-1.5 font-mono text-[10px] transition-all",
                        settings.agentMode === mode
                          ? "border-neon/30 bg-neon/8 text-neon"
                          : "border-noir-border bg-noir-card text-warm-500 hover:border-noir-border-light hover:text-warm-300"
                      )}
                    >
                      {mode}
                    </button>
                  ))}
                </div>
              </SettingRow>

              <div className="divider" />

              {/* API key override */}
              <SettingRow label="API Key Override">
                <input
                  type="password"
                  value={settings.apiKeyOverride}
                  onChange={(e) =>
                    updateField("apiKeyOverride", e.target.value)
                  }
                  placeholder="sk-ant-..."
                  className="input-noir w-full rounded-none px-3 py-2 font-mono text-xs"
                />
                <p className="mt-1.5 font-mono text-[9px] text-warm-600">
                  optional — overrides the default auth for API calls
                </p>
              </SettingRow>
            </div>
          </motion.section>

          {/* ─────────────────────────────────────────────────
             Section 4 : Danger Zone
             ───────────────────────────────────────────────── */}
          <motion.section variants={itemVariants} className="pb-12">
            <SectionHeader
              icon={AlertTriangle}
              title="Danger Zone"
              danger
            />
            <div className="mt-4 space-y-4 rounded-none border border-status-error/20 bg-noir-surface p-6">
              {/* Clear all agents */}
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-mono text-xs text-warm-200">
                    Clear all agents
                  </p>
                  <p className="mt-0.5 font-mono text-[9px] text-warm-600">
                    stop and remove all agents from the dashboard
                  </p>
                </div>
                <motion.button
                  onClick={clearAllAgents}
                  whileTap={{ scale: 0.97 }}
                  className="flex items-center gap-2 border border-status-error/30 bg-status-error/5 px-4 py-2 font-mono text-[10px] text-status-error transition-all hover:border-status-error/50 hover:bg-status-error/10"
                >
                  <Trash2 className="h-3 w-3" />
                  clear all
                </motion.button>
              </div>

              <div className="divider" />

              {/* Reset settings */}
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-mono text-xs text-warm-200">
                    Reset settings
                  </p>
                  <p className="mt-0.5 font-mono text-[9px] text-warm-600">
                    restore all settings to their default values
                  </p>
                </div>
                <motion.button
                  onClick={resetSettings}
                  whileTap={{ scale: 0.97 }}
                  className="flex items-center gap-2 border border-status-error/30 bg-status-error/5 px-4 py-2 font-mono text-[10px] text-status-error transition-all hover:border-status-error/50 hover:bg-status-error/10"
                >
                  <RotateCcw className="h-3 w-3" />
                  reset
                </motion.button>
              </div>
            </div>
          </motion.section>
        </motion.div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   Sous-composants internes — gardent le composant principal lisible
   ═══════════════════════════════════════════════════════════════ */

/**
 * Header de section avec icone et titre.
 * Le style "danger" utilise la couleur d'erreur rouge au lieu du vert neon.
 */
function SectionHeader({
  icon: Icon,
  title,
  danger = false,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  danger?: boolean;
}) {
  return (
    <div className="flex items-center gap-2.5">
      <Icon
        className={cn(
          "h-4 w-4",
          danger ? "text-status-error" : "text-neon/70"
        )}
      />
      <h2
        className={cn(
          "font-mono text-[10px] uppercase tracking-[0.2em]",
          danger ? "text-status-error" : "text-warm-400"
        )}
      >
        {title}
      </h2>
    </div>
  );
}

/**
 * Ligne de setting avec label a gauche et contenu a droite.
 * Dispose le label au-dessus du contenu sur mobile.
 */
function SettingRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="mb-2 block font-mono text-[10px] uppercase tracking-[0.2em] text-warm-500">
        {label}
      </label>
      {children}
    </div>
  );
}

/**
 * Toggle switch custom — reprend le meme pattern que le spawn dialog.
 * Pas de dependance UI externe, juste du CSS Tailwind.
 */
function Toggle({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={cn(
        "flex h-5 w-9 items-center rounded-full border p-0.5 transition-colors",
        checked
          ? "border-neon/30 bg-neon/15"
          : "border-noir-border bg-noir-card"
      )}
      role="switch"
      aria-checked={checked}
    >
      <span
        className={cn(
          "h-3.5 w-3.5 rounded-full transition-all",
          checked ? "translate-x-3.5 bg-neon" : "translate-x-0 bg-warm-500"
        )}
      />
    </button>
  );
}
