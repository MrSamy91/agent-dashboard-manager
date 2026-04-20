import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** Merge propre des classes Tailwind (evite les conflits) */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Formate un montant en dollars US */
export function formatCost(usd: number): string {
  if (usd < 0.01) return "$0.00";
  return `$${usd.toFixed(2)}`;
}

/** Formate une durée en secondes vers un format lisible */
export function formatDuration(startMs: number, endMs?: number): string {
  const elapsed = Math.floor(((endMs ?? Date.now()) - startMs) / 1000);
  if (elapsed < 60) return `${elapsed}s`;
  const minutes = Math.floor(elapsed / 60);
  const seconds = elapsed % 60;
  if (minutes < 60) return `${minutes}m ${seconds}s`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m`;
}

/** Couleurs du thème Noir Terminal pour chaque statut */
export function getStatusColor(status: string) {
  switch (status) {
    case "running":
      return {
        dot: "bg-neon",
        text: "text-neon",
        badge: "bg-neon/10 text-neon",
        glow: "shadow-[0_0_8px_#00ff8825]",
      };
    case "completed":
      return {
        dot: "bg-status-completed",
        text: "text-status-completed",
        badge: "bg-status-completed/10 text-status-completed",
        glow: "",
      };
    case "error":
      return {
        dot: "bg-status-error",
        text: "text-status-error",
        badge: "bg-status-error/10 text-status-error",
        glow: "",
      };
    case "stopped":
      return {
        dot: "bg-status-stopped",
        text: "text-status-stopped",
        badge: "bg-status-stopped/10 text-status-stopped",
        glow: "",
      };
    default:
      return {
        dot: "bg-warm-400",
        text: "text-warm-400",
        badge: "bg-warm-400/10 text-warm-400",
        glow: "",
      };
  }
}
