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

// ─── Settings ──────────────────────────────────────────────

export function toastSettingsSaved() {
  toast.success({ title: "Settings saved", fill: FILL });
}
