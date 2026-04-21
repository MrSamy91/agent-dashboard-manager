import { orchestrator } from "@/lib/agent-orchestrator";
import { NextResponse } from "next/server";

/**
 * POST /api/agents/:id/resume — Envoyer un message de suivi à un agent.
 * Reprend la session existante pour continuer la conversation.
 * Body: { message: string }
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const agent = orchestrator.getById(id);

  if (!agent) {
    return NextResponse.json({ error: "Agent not found" }, { status: 404 });
  }

  if (!agent.sessionId) {
    return NextResponse.json(
      { error: "Agent has no session to resume (mock mode?)" },
      { status: 400 }
    );
  }

  try {
    const { message } = (await request.json()) as { message: string };

    if (!message?.trim()) {
      return NextResponse.json(
        { error: "Message is required" },
        { status: 400 }
      );
    }

    console.log(`[api/resume] agent=${id} model=${agent.model || "default"} message="${message.trim().slice(0, 60)}"`);
    await orchestrator.resume(id, message.trim());

    return NextResponse.json({
      message: "Resumed",
      agent: orchestrator.getById(id),
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to resume" },
      { status: 500 }
    );
  }
}
