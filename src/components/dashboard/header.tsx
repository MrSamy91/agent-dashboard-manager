"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Menu, Plus, Settings } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";

interface ConnectionStatus {
  mode: string;
  connected: boolean;
  email: string | null;
  subscription: string | null;
}

interface HeaderProps {
  agentCount: number;
  onSpawn: () => void;
  /** Toggle sidebar overlay on mobile */
  onToggleSidebar?: () => void;
  /** Nombre de tâches en attente dans la queue */
  queueCount?: number;
}

export function Header({ agentCount, onSpawn, onToggleSidebar, queueCount }: HeaderProps) {
  const [status, setStatus] = useState<ConnectionStatus | null>(null);

  // Fetch le statut de connexion au mount
  useEffect(() => {
    fetch("/api/status")
      .then((r) => r.json())
      .then(setStatus)
      .catch(() => null);
  }, []);

  return (
    <header className="relative border-b border-noir-border">
      <div className="mx-auto flex h-14 max-w-[1600px] items-center justify-between px-8">
        {/* Titre en serif + hamburger mobile */}
        <div className="flex items-center gap-3">
          {/* Hamburger — visible uniquement sur mobile pour ouvrir la sidebar */}
          {onToggleSidebar && (
            <button
              onClick={onToggleSidebar}
              className="flex h-8 w-8 items-center justify-center text-warm-400 transition-colors hover:text-warm-100 md:hidden"
              aria-label="Toggle sidebar"
            >
              <Menu className="h-5 w-5" />
            </button>
          )}
          <div className="flex items-baseline gap-4">
            <h1 className="font-display text-xl tracking-tight text-warm-100">
              Agent Dashboard
            </h1>
            <span className="hidden font-mono text-[11px] tracking-wide text-warm-500 sm:inline">
              claude sdk
            </span>
          </div>
        </div>

        <div className="flex items-center gap-5">
          {/* ─── Statut de connexion ─── */}
          {status && (
            <div className="hidden items-center gap-2 font-mono text-[10px] md:flex">
              <span
                className={cn(
                  "h-1.5 w-1.5 rounded-full",
                  status.connected ? "bg-neon" : status.mode === "mock" ? "bg-status-stopped" : "bg-status-error"
                )}
              />
              {status.connected ? (
                <>
                  <span className="text-warm-400">{status.email?.split("@")[0]}</span>
                  <span className="text-warm-600">·</span>
                  <span className="uppercase text-warm-500">{status.subscription}</span>
                </>
              ) : (
                <span className={status.mode === "mock" ? "text-status-stopped" : "text-status-error"}>
                  {status.mode === "mock" ? "mock mode" : "not connected"}
                </span>
              )}
            </div>
          )}

          <div className="h-4 w-px bg-noir-border" />

          {/* Compteur d'agents actifs */}
          <div className="flex items-center gap-2.5 font-mono text-xs">
            <span
              className={cn(
                "inline-block h-1.5 w-1.5 rounded-full",
                agentCount > 0
                  ? "bg-neon animate-pulse-neon"
                  : "bg-warm-500"
              )}
            />
            <span className="tabular-nums text-warm-300">
              {agentCount}
            </span>
            <span className="text-warm-500">
              active
            </span>
          </div>

          <div className="h-4 w-px bg-noir-border" />

          {/* Lien vers les settings */}
          <Link
            href="/settings"
            className="flex h-7 w-7 items-center justify-center text-warm-500 transition-colors hover:text-warm-200"
            title="Settings"
          >
            <Settings className="h-4 w-4" />
          </Link>

          <div className="h-4 w-px bg-noir-border" />

          {/* Bouton spawn */}
          <motion.button
            onClick={onSpawn}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.97 }}
            className="group flex items-center gap-2 rounded-lg border border-neon/25 bg-neon/5 px-3.5 py-1.5 font-mono text-xs font-medium text-neon transition-all hover:border-neon/40 hover:bg-neon/10 hover:shadow-[0_0_20px_#00ff880d]"
          >
            <Plus className="h-3.5 w-3.5 transition-transform group-hover:rotate-90" />
            spawn
          </motion.button>
        </div>
      </div>
    </header>
  );
}
