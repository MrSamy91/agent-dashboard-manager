"use client";

import { Component, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * Error Boundary pour le Dashboard.
 *
 * React n'expose pas encore de hook pour les error boundaries — on doit
 * utiliser une class component avec getDerivedStateFromError / componentDidCatch.
 * Toute erreur non gérée dans le sous-arbre du Dashboard atterrit ici
 * au lieu de planter silencieusement la page entière.
 */
export class DashboardErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: { componentStack: string }) {
    // En prod, on enverrait ça à Sentry ou un service de monitoring
    console.error("[DashboardErrorBoundary]", error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex min-h-screen flex-col items-center justify-center bg-noir p-12">
          <pre className="mb-6 font-mono text-[9px] leading-tight text-warm-700 select-none">
{`
  ╭──────────────────────────╮
  │                          │
  │    something crashed     │
  │                          │
  ╰──────────────────────────╯
`}
          </pre>
          <p className="font-mono text-xs text-status-error/70">
            {this.state.error.message}
          </p>
          <button
            onClick={() => this.setState({ error: null })}
            className="mt-6 border border-noir-border px-4 py-2 font-mono text-[11px] text-warm-400 transition-colors hover:border-noir-border-light hover:text-warm-200"
          >
            retry
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
