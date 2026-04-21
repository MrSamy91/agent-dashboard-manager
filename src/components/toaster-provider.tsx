"use client";

/**
 * Monte gooey-toast une seule fois au démarrage de l'app.
 * Rendu dans layout.tsx — ne produit aucun DOM React
 * (le toaster se monte lui-même sur document.body).
 */

import { useEffect } from "react";
import { mountToaster } from "gooey-toast";

export function ToasterProvider() {
  useEffect(() => {
    const handle = mountToaster({
      position: "bottom-right",
      offset: { bottom: 16, right: 16 },
    });
    return () => handle.unmount();
  }, []);

  return null;
}
