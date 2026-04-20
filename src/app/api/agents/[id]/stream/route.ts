import { orchestrator } from "@/lib/agent-orchestrator";

/**
 * GET /api/agents/:id/stream — Server-Sent Events (SSE)
 *
 * Stream temps réel de l'output d'un agent.
 * Le client se connecte et reçoit chaque message au fur et à mesure.
 * La connexion se ferme automatiquement quand l'agent termine.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const agent = orchestrator.getById(id);

  if (!agent) {
    return new Response("Agent not found", { status: 404 });
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      // Envoyer d'abord tous les messages existants (rattraper l'historique)
      for (const msg of agent.output) {
        const data = `data: ${JSON.stringify(msg)}\n\n`;
        controller.enqueue(encoder.encode(data));
      }

      // Si l'agent est déjà terminé, fermer directement après le catch-up
      if (["completed", "error", "stopped"].includes(agent.status)) {
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
        return;
      }

      // S'abonner aux nouveaux messages en temps réel
      const unsubscribe = orchestrator.subscribe(id, (event) => {
        try {
          const data = `data: ${JSON.stringify(event)}\n\n`;
          controller.enqueue(encoder.encode(data));

          // Fermer le stream dès que l'agent est terminé
          const currentAgent = orchestrator.getById(id);
          if (
            currentAgent &&
            ["completed", "error", "stopped"].includes(currentAgent.status)
          ) {
            // Petit délai pour s'assurer que le dernier message est bien transmis
            setTimeout(() => {
              try {
                controller.enqueue(encoder.encode("data: [DONE]\n\n"));
                controller.close();
              } catch {
                /* stream already closed */
              }
            }, 100);
            unsubscribe();
            clearInterval(heartbeat);
          }
        } catch {
          unsubscribe();
          clearInterval(heartbeat);
        }
      });

      /**
       * Heartbeat SSE toutes les 20s.
       * Les proxies et CDN (nginx, Cloudflare) ferment les connexions idle après ~30s.
       * Un commentaire SSE (": keep-alive") maintient la connexion sans déclencher
       * d'événement côté client (EventSource l'ignore silencieusement).
       */
      const heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(": keep-alive\n\n"));
        } catch {
          clearInterval(heartbeat);
        }
      }, 20_000);

      // Cleanup complet quand le client se déconnecte (navigation, onglet fermé)
      request.signal.addEventListener("abort", () => {
        unsubscribe();
        clearInterval(heartbeat);
        try { controller.close(); } catch { /* already closed */ }
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
