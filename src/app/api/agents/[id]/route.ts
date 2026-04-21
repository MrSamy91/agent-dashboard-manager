import { orchestrator } from "@/lib/agent-orchestrator";
import { NextResponse } from "next/server";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/agents/:id — Récupérer le détail d'un agent
 * Inclut tout l'output et les métadonnées
 */
export async function GET(_request: Request, { params }: RouteParams) {
  const { id } = await params;
  const agent = orchestrator.getById(id);

  if (!agent) {
    return NextResponse.json({ error: "Agent not found" }, { status: 404 });
  }

  return NextResponse.json({ agent });
}

/**
 * PATCH /api/agents/:id — Modifier un agent (rename, folder, model)
 * Body: { name?: string, folderId?: string | null, model?: string }
 */
export async function PATCH(request: Request, { params }: RouteParams) {
  const { id } = await params;
  const body = (await request.json()) as { name?: string; folderId?: string | null; model?: string };

  const agent = orchestrator.getById(id);
  if (!agent) {
    return NextResponse.json({ error: "Agent not found" }, { status: 404 });
  }

  const hasName = typeof body.name === "string" && body.name.trim();
  const hasFolderId = "folderId" in body;
  const hasModel = typeof body.model === "string";

  if (!hasName && !hasFolderId && !hasModel) {
    return NextResponse.json({ error: "Provide name, folderId, or model" }, { status: 400 });
  }

  if (hasName) orchestrator.rename(id, body.name!.trim());
  if (hasFolderId) orchestrator.assignAgentToFolder(id, body.folderId ?? undefined);
  if (hasModel) agent.model = body.model || undefined;

  return NextResponse.json({ agent: orchestrator.getById(id) });
}

/**
 * DELETE /api/agents/:id — Stopper un agent en cours
 * Si l'agent est déjà terminé, le supprime de la liste
 */
export async function DELETE(_request: Request, { params }: RouteParams) {
  const { id } = await params;
  const agent = orchestrator.getById(id);

  if (!agent) {
    return NextResponse.json({ error: "Agent not found" }, { status: 404 });
  }

  // Si l'agent tourne encore, on le stoppe
  if (agent.status === "running" || agent.status === "pending") {
    orchestrator.stop(id);
    return NextResponse.json({ message: "Agent stopped", agent: orchestrator.getById(id) });
  }

  // Sinon on le supprime de la liste
  orchestrator.remove(id);
  return NextResponse.json({ message: "Agent removed" });
}
