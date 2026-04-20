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
 * PATCH /api/agents/:id — Renommer un agent
 * Body: { name: string }
 */
export async function PATCH(request: Request, { params }: RouteParams) {
  const { id } = await params;
  const { name } = (await request.json()) as { name: string };

  if (!name?.trim()) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }

  const success = orchestrator.rename(id, name.trim());
  if (!success) {
    return NextResponse.json({ error: "Agent not found" }, { status: 404 });
  }

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
