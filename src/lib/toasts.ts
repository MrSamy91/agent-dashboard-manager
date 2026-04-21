/**
 * Helpers toast pour le dashboard — wrappent gooey-toast
 * avec le theme Noir Terminal (fill sombre).
 *
 * Module pur (pas "use client") : importable partout,
 * mais les appels toast.* ne fonctionnent que côté client
 * car ils manipulent le DOM.
 */

import { toast } from "gooey-toast";

/** Fond des toasts — matche --color-noir-card */
const FILL = "#111111";

// ─── Agent lifecycle ───────────────────────────────────────

export function toastAgentSpawned(name: string) {
  toast.success({ title: "Agent spawned", description: name, fill: FILL });
}

export function toastAgentCompleted(name: string) {
  toast.info({ title: "Agent completed", description: name, fill: FILL });
}

export function toastAgentError(name: string) {
  toast.error({ title: "Agent error", description: name, fill: FILL });
}

export function toastAgentStopped(name: string) {
  toast.warning({ title: "Agent stopped", description: name, fill: FILL });
}

// ─── Folders ───────────────────────────────────────────────

export function toastFolderCreated(name: string) {
  toast.success({ title: "Folder created", description: name, fill: FILL });
}

export function toastFolderDeleted(name: string) {
  toast.success({ title: "Folder deleted", description: name, fill: FILL });
}

// ─── Notification sound — Web Audio API beep (pas de fichier audio) ───

/**
 * Joue un bref "beep" subtil via Web Audio API.
 * Utilisé quand un agent termine (completed/error) pour alerter l'utilisateur.
 * Fail silently si l'audio n'est pas disponible (SSR, autoplay policy, etc.).
 */
export function playNotificationSound() {
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = 800; // Hz — ton neutre, pas agressif
    gain.gain.value = 0.08; // Volume très subtil
    osc.start();
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
    osc.stop(ctx.currentTime + 0.3);
  } catch {
    /* Audio not available — on ignore silencieusement */
  }
}

// ─── Settings ──────────────────────────────────────────────

export function toastSettingsSaved() {
  toast.success({ title: "Settings saved", fill: FILL });
}
