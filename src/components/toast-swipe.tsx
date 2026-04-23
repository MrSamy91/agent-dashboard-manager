"use client";

/**
 * Swipe-to-dismiss pour les toasts Sonner.
 * Supporte touch (mobile) + mouse drag (desktop).
 * Observe le DOM pour attacher automatiquement sur chaque nouveau toast.
 * Adapté de C:\dev\portfolio\components\ui\toast-swipe.tsx
 */

import { useEffect } from "react";
import { toast } from "sonner";

const SWIPE_THRESHOLD = 80;

function attachSwipe(el: HTMLElement) {
  if (el.dataset.swipeAttached) return;
  el.dataset.swipeAttached = "true";

  let startX = 0;
  let currentX = 0;
  let swiping = false;

  // ─── Touch events (mobile) ───
  el.addEventListener("touchstart", (e) => {
    startX = e.touches[0].clientX;
    currentX = startX;
    swiping = true;
    el.style.transition = "none";
  }, { passive: true });

  el.addEventListener("touchmove", (e) => {
    if (!swiping) return;
    currentX = e.touches[0].clientX;
    const dx = currentX - startX;
    el.style.transform = `translateX(${dx}px)`;
    el.style.opacity = `${1 - Math.min(Math.abs(dx) / 200, 0.6)}`;
  }, { passive: true });

  el.addEventListener("touchend", () => {
    if (!swiping) return;
    swiping = false;
    const dx = currentX - startX;
    if (Math.abs(dx) > SWIPE_THRESHOLD) {
      const direction = dx > 0 ? "100%" : "-100%";
      el.style.transition = "transform 0.25s ease, opacity 0.25s ease";
      el.style.transform = `translateX(${direction})`;
      el.style.opacity = "0";
      const toastId = el.getAttribute("data-sonner-toast");
      setTimeout(() => { if (toastId) toast.dismiss(toastId); }, 250);
    } else {
      el.style.transition = "transform 0.3s cubic-bezier(0.22, 1.2, 0.36, 1), opacity 0.3s ease";
      el.style.transform = "translateX(0)";
      el.style.opacity = "1";
    }
  });

  // ─── Mouse events (desktop) ───
  let mouseDown = false;
  let mouseStartX = 0;

  el.addEventListener("mousedown", (e) => {
    mouseStartX = e.clientX;
    mouseDown = true;
    el.style.transition = "none";
    el.style.cursor = "grabbing";
  });

  const onMouseMove = (e: MouseEvent) => {
    if (!mouseDown) return;
    const dx = e.clientX - mouseStartX;
    el.style.transform = `translateX(${dx}px)`;
    el.style.opacity = `${1 - Math.min(Math.abs(dx) / 200, 0.6)}`;
  };

  const onMouseUp = (e: MouseEvent) => {
    if (!mouseDown) return;
    mouseDown = false;
    el.style.cursor = "";
    const dx = e.clientX - mouseStartX;
    if (Math.abs(dx) > SWIPE_THRESHOLD) {
      const direction = dx > 0 ? "100%" : "-100%";
      el.style.transition = "transform 0.25s ease, opacity 0.25s ease";
      el.style.transform = `translateX(${direction})`;
      el.style.opacity = "0";
      const toastId = el.getAttribute("data-sonner-toast");
      setTimeout(() => { if (toastId) toast.dismiss(toastId); }, 250);
    } else {
      el.style.transition = "transform 0.3s cubic-bezier(0.22, 1.2, 0.36, 1), opacity 0.3s ease";
      el.style.transform = "translateX(0)";
      el.style.opacity = "1";
    }
  };

  document.addEventListener("mousemove", onMouseMove);
  document.addEventListener("mouseup", onMouseUp);
}

export function ToastSwipeHandler() {
  useEffect(() => {
    const observer = new MutationObserver(() => {
      document.querySelectorAll<HTMLElement>("[data-sonner-toast]").forEach(attachSwipe);
    });
    observer.observe(document.body, { childList: true, subtree: true });
    document.querySelectorAll<HTMLElement>("[data-sonner-toast]").forEach(attachSwipe);
    return () => observer.disconnect();
  }, []);

  return null;
}
