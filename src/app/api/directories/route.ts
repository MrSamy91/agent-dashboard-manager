import { NextResponse } from "next/server";
import { readdir, stat } from "fs/promises";
import { join, resolve, sep, parse } from "path";
import { homedir } from "os";

/**
 * GET /api/directories?path=...
 * Liste les sous-dossiers d'un chemin donné.
 * Si aucun path fourni, retourne le home directory.
 * Filtre les dossiers cachés et systèmes pour un affichage propre.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const rawPath = searchParams.get("path") || homedir();
  const dirPath = resolve(rawPath);

  try {
    const entries = await readdir(dirPath, { withFileTypes: true });

    // Filtrer : uniquement les dossiers, pas les cachés/systèmes
    const dirs: string[] = [];
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      // Ignorer les dossiers cachés (commencent par .) et les dossiers systèmes courants
      if (entry.name.startsWith(".")) continue;
      if (entry.name === "node_modules" || entry.name === "__pycache__") continue;
      dirs.push(entry.name);
    }

    // Trier alphabétiquement (insensible à la casse)
    dirs.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));

    // Calculer le parent (remonter d'un niveau)
    const parsed = parse(dirPath);
    const parent = parsed.dir || null;
    // Sur Windows, la racine est C:\ — on ne peut pas remonter plus haut
    const isRoot = dirPath === parsed.root;

    return NextResponse.json({
      current: dirPath,
      parent: isRoot ? null : parent,
      directories: dirs,
      separator: sep,
    });
  } catch (err) {
    return NextResponse.json(
      { error: `Cannot read directory: ${err instanceof Error ? err.message : String(err)}` },
      { status: 400 }
    );
  }
}
