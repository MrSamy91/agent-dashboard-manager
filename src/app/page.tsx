import { Dashboard } from "@/components/dashboard/dashboard";
import { DashboardErrorBoundary } from "@/components/dashboard/error-boundary";

/**
 * Page principale — Server Component qui rend le dashboard client.
 * Le dashboard gère tout le state côté client (polling, SSE, interactions).
 * L'Error Boundary intercepte les crashs non gérés pour afficher un fallback
 * élégant plutôt qu'un écran blanc.
 */
export default function HomePage() {
  return (
    <DashboardErrorBoundary>
      <Dashboard />
    </DashboardErrorBoundary>
  );
}
