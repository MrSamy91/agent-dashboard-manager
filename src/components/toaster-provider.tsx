"use client";

/**
 * Provider Sonner + swipe handler.
 * Rendu dans layout.tsx — monte le Toaster en bottom-right
 * et attache le swipe-to-dismiss sur chaque toast.
 */

import { Toaster } from "sonner";
import { ToastSwipeHandler } from "./toast-swipe";

export function ToasterProvider() {
  return (
    <>
      <Toaster
        position="bottom-right"
        /* On gère le rendu custom et la durée nous-mêmes dans toasts.tsx */
        toastOptions={{ unstyled: true }}
      />
      <ToastSwipeHandler />
    </>
  );
}
