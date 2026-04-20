import { NextResponse } from "next/server";
import { readFile, writeFile } from "fs/promises";
import { join } from "path";

/**
 * Chemin du fichier de persistence des settings.
 * Stocke dans la racine du projet pour un acces simple en dev.
 */
const SETTINGS_PATH = join(process.cwd(), "settings.json");

/**
 * Settings par defaut — utilises quand le fichier n'existe pas encore
 * ou quand on reset les settings.
 */
export const DEFAULT_SETTINGS = {
  // ─── General ───
  defaultModel: "",
  defaultPermissionMode: "acceptEdits",
  defaultWorkingDirectory: "",
  loadClaudeMd: true,

  // ─── Appearance ───
  pollingInterval: 5000,
  terminalFontSize: "sm",

  // ─── API & Connection ───
  agentMode: process.env.AGENT_MODE || "mock",
  apiKeyOverride: "",
};

export type Settings = typeof DEFAULT_SETTINGS;

/**
 * GET /api/settings — Lire les settings actuels.
 * Si le fichier n'existe pas, retourne les valeurs par defaut.
 */
export async function GET() {
  try {
    const raw = await readFile(SETTINGS_PATH, "utf-8");
    const saved = JSON.parse(raw);
    // Merge avec les defaults pour gerer les nouveaux champs ajoutes apres un update
    return NextResponse.json({ ...DEFAULT_SETTINGS, ...saved });
  } catch {
    // Fichier inexistant ou JSON invalide → retourner les defaults
    return NextResponse.json(DEFAULT_SETTINGS);
  }
}

/**
 * PUT /api/settings — Sauvegarder les settings.
 * Merge les champs envoyes avec les defaults pour ne jamais perdre de cles.
 */
export async function PUT(request: Request) {
  try {
    const body = await request.json();

    // Lire les settings existants pour merge
    let existing = { ...DEFAULT_SETTINGS };
    try {
      const raw = await readFile(SETTINGS_PATH, "utf-8");
      existing = { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
    } catch {
      // Pas de fichier existant, on part des defaults
    }

    // Merge : les champs du body ecrasent les existants
    const merged = { ...existing, ...body };

    // Ecrire le fichier avec indentation pour lisibilite
    await writeFile(SETTINGS_PATH, JSON.stringify(merged, null, 2), "utf-8");

    return NextResponse.json(merged);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to save settings" },
      { status: 500 }
    );
  }
}
