import { orchestrator, type SpawnTask } from "@/lib/agent-orchestrator";
import { NextResponse } from "next/server";

/**
 * GET /api/agents — Récupérer agents + folders en un seul appel.
 * Utilisé par le dashboard pour le polling temps réel.
 * Inclure les folders ici évite un second appel réseau.
 */
export async function GET() {
  const agents = orchestrator.getAll();
  const folders = await orchestrator.getAllFolders();
  return NextResponse.json({ agents, folders });
}

/**
 * POST /api/agents — Spawner un nouvel agent
 * Body: { name, prompt, tools, workingDirectory? }
 */
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as SpawnTask;

    // Validation basique des champs requis
    if (!body.name || !body.prompt || !body.tools?.length) {
      return NextResponse.json(
        { error: "Missing required fields: name, prompt, tools" },
        { status: 400 }
      );
    }

    const id = await orchestrator.spawn(body);
    const agent = orchestrator.getById(id);

    return NextResponse.json({ id, agent }, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to spawn agent" },
      { status: 500 }
    );
  }
}
