"use client";

import { useEffect } from "react";
import type { AgentState } from "@/lib/agent-orchestrator";

/**
 * Favicon dynamique qui change de couleur selon l'activite des agents :
 * - Vert : au moins un agent running/pending
 * - Rouge : au moins un agent en erreur (et aucun running)
 * - Bleu : tous completed (aucun running ni erreur)
 * - Gris : aucun agent
 */
export function useDynamicFavicon(agents: AgentState[]) {
  useEffect(() => {
    const hasRunning = agents.some(
      (a) => a.status === "running" || a.status === "pending"
    );
    const hasError = agents.some((a) => a.status === "error");
    const hasCompleted = agents.some((a) => a.status === "completed");

    // Priorite : running > error > completed > idle
    const color = hasRunning
      ? "#00ff88"
      : hasError
        ? "#ff4444"
        : hasCompleted
          ? "#5588ff"
          : "#656159";

    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><circle cx="16" cy="16" r="14" fill="${color}"/></svg>`;
    const url = `data:image/svg+xml,${encodeURIComponent(svg)}`;

    let link = document.querySelector('link[rel="icon"]') as HTMLLinkElement;
    if (!link) {
      link = document.createElement("link");
      link.rel = "icon";
      document.head.appendChild(link);
    }
    link.href = url;
  }, [agents]);
}
