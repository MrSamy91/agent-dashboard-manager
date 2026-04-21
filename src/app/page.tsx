import { Dashboard } from "@/components/dashboard/dashboard";
import { DashboardErrorBoundary } from "@/components/dashboard/error-boundary";
import { orchestrator } from "@/lib/agent-orchestrator";

/**
 * Page principale — Server Component avec pre-fetch SSR.
 * Charge agents + folders côté serveur pour un premier paint
 * immédiat avec données (pas de flash vide en attendant le polling).
 * Le dashboard prend le relais côté client pour les updates temps réel.
 */
export default async function HomePage() {
  // Pre-fetch SSR — s'exécute sur le serveur à chaque requête
  const initialAgents = orchestrator.getAll();
  const initialFolders = await orchestrator.getAllFolders();

  return (
    <DashboardErrorBoundary>
      <Dashboard
        initialAgents={initialAgents}
        initialFolders={initialFolders}
      />
    </DashboardErrorBoundary>
  );
}
