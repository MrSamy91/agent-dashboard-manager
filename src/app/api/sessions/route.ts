import { NextResponse } from "next/server";
import { readdir, stat, open } from "fs/promises";
import { join } from "path";
import { homedir } from "os";

interface SessionInfo {
  id: string;
  project: string;
  /** Chemin réel du projet (décodé depuis le nom du dossier) */
  cwd: string;
  /** Taille du fichier JSONL en bytes */
  sizeBytes: number;
  /** Date de dernière modification */
  lastModified: string;
  /** Premier message user (aperçu tronqué) */
  preview: string;
}

/**
 * Décoder le nom du dossier projet vers le chemin réel.
 * Ex: "C--dev-escape-tennis" → "C:/dev/escape-tennis"
 */
function decodeProjectPath(encoded: string): string {
  // Le format est: lettre du drive + "--" + chemin avec "-" comme séparateur
  // Mais les tirets dans les noms de dossiers rendent ça ambigu
  // On fait une conversion simple : premier segment = drive, le reste = path
  return encoded.replace(/^([A-Za-z])--/, "$1:/").replace(/-/g, "/");
}

/**
 * Extraire le premier message user du fichier JSONL (lecture partielle).
 * On ne lit que les premiers 8KB pour éviter de charger des fichiers de 4MB+.
 */
async function extractPreview(filePath: string): Promise<string> {
  try {
    const handle = await open(filePath, "r");
    const buffer = Buffer.alloc(8192);
    await handle.read(buffer, 0, 8192, 0);
    await handle.close();

    const text = buffer.toString("utf-8");
    const lines = text.split("\n");

    for (const line of lines) {
      if (!line.includes('"type":"user"')) continue;
      try {
        const parsed = JSON.parse(line);
        const content = parsed?.message?.content;
        if (typeof content === "string") {
          return content.slice(0, 120).replace(/\n/g, " ");
        }
        // Content peut être un array (multipart)
        if (Array.isArray(content)) {
          const textPart = content.find((c: { type: string }) => c.type === "text");
          if (textPart?.text) return textPart.text.slice(0, 120).replace(/\n/g, " ");
        }
      } catch { continue; }
    }
    return "(no preview)";
  } catch {
    return "(unreadable)";
  }
}

/**
 * GET /api/sessions — Liste toutes les sessions Claude Code locales.
 * Scanne ~/.claude/projects/ pour trouver les fichiers .jsonl de session.
 * Optionnel: ?project=C--dev-escape-tennis pour filtrer par projet.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const filterProject = searchParams.get("project");

  const projectsDir = join(homedir(), ".claude", "projects");

  try {
    const projects = await readdir(projectsDir);
    const sessions: SessionInfo[] = [];

    for (const project of projects) {
      if (filterProject && project !== filterProject) continue;

      const projectDir = join(projectsDir, project);
      const projectStat = await stat(projectDir).catch(() => null);
      if (!projectStat?.isDirectory()) continue;

      const files = await readdir(projectDir);
      const jsonlFiles = files.filter((f) => f.endsWith(".jsonl"));

      for (const file of jsonlFiles) {
        const filePath = join(projectDir, file);
        const fileStat = await stat(filePath).catch(() => null);
        if (!fileStat) continue;

        const sessionId = file.replace(".jsonl", "");
        const preview = await extractPreview(filePath);

        sessions.push({
          id: sessionId,
          project,
          cwd: decodeProjectPath(project),
          sizeBytes: fileStat.size,
          lastModified: fileStat.mtime.toISOString(),
          preview,
        });
      }
    }

    // Trier par date de modification (plus récent en premier)
    sessions.sort((a, b) => new Date(b.lastModified).getTime() - new Date(a.lastModified).getTime());

    return NextResponse.json({ sessions });
  } catch (err) {
    return NextResponse.json(
      { error: `Failed to list sessions: ${err instanceof Error ? err.message : String(err)}` },
      { status: 500 }
    );
  }
}
