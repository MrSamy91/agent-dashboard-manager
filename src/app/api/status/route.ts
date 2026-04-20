import { NextResponse } from "next/server";
import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

/**
 * GET /api/status — Retourne le statut de connexion et le mode du dashboard.
 * Exécute `claude auth status` pour récupérer les infos d'auth.
 */
export async function GET() {
  const mode = process.env.AGENT_MODE || "mock";

  // En mode mock, pas besoin de checker l'auth
  if (mode === "mock") {
    return NextResponse.json({
      mode: "mock",
      connected: false,
      email: null,
      subscription: null,
    });
  }

  // En mode real, on exécute `claude auth status` pour récupérer les infos
  try {
    const { stdout } = await execFileAsync("claude", ["auth", "status"], {
      timeout: 5000,
      env: { ...process.env },
    });

    const info = JSON.parse(stdout);

    return NextResponse.json({
      mode: "real",
      connected: info.loggedIn === true,
      email: info.email ?? null,
      subscription: info.subscriptionType ?? null,
      org: info.orgName ?? null,
    });
  } catch {
    return NextResponse.json({
      mode: "real",
      connected: false,
      email: null,
      subscription: null,
      error: "Could not reach Claude CLI",
    });
  }
}
