import type { Metadata } from "next";
import { SettingsPage } from "@/components/settings/settings-page";

/**
 * Metadata SEO pour la page settings.
 * Reprend le pattern du layout principal.
 */
export const metadata: Metadata = {
  title: "Settings — Agent Dashboard",
  description: "Configure the Agent Dashboard: model, permissions, appearance, and API connection.",
};

/**
 * Page /settings — Server Component qui rend le client component SettingsPage.
 * Toute l'interactivite (fetch, state, handlers) vit dans le composant client.
 */
export default function SettingsRoute() {
  return <SettingsPage />;
}
