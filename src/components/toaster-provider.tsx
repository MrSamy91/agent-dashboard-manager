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
        gap={8}
        offset={16}
        visibleToasts={3}
        toastOptions={{
          unstyled: true,
          className: "!p-0 !bg-transparent !border-none !shadow-none",
        }}
      />
      <ToastSwipeHandler />
    </>
  );
}
