"use server";

/**
 * Server Actions pour le CRUD des dossiers.
 * Appelle directement l'orchestrator — pas de hop HTTP,
 * pas besoin de routes API dédiées.
 */

import { orchestrator, type Folder } from "@/lib/agent-orchestrator";

/** Créer un nouveau dossier et retourner ses données */
export async function createFolder(name: string): Promise<Folder> {
  return orchestrator.createFolder(name.trim() || "New Folder");
}

/** Renommer un dossier existant */
export async function renameFolder(id: string, newName: string): Promise<boolean> {
  const trimmed = newName.trim();
  if (!trimmed) return false;
  return orchestrator.renameFolder(id, trimmed);
}

/** Supprimer un dossier — ses agents deviennent orphelins */
export async function deleteFolder(id: string): Promise<boolean> {
  return orchestrator.removeFolder(id);
}

/** Assigner un agent à un dossier (null = désassigner) */
export async function assignAgentToFolder(
  agentId: string,
  folderId: string | null
): Promise<boolean> {
  return orchestrator.assignAgentToFolder(agentId, folderId ?? undefined);
}
