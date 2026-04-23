/**
 * Système de toast custom basé sur Sonner.
 * Adapté du portfolio (C:\dev\portfolio\lib\toast.tsx)
 * avec le thème Noir Terminal du dashboard.
 *
 * Features :
 * - 4 types : info, success, warning, error
 * - Left border colorée par type
 * - Progress bar rAF (pause on hover)
 * - Close button + swipe dismiss
 * - Max 3 visibles (queue les suivants)
 * - Icônes Lucide
 */

import React, { useEffect, useRef } from "react";
import { toast } from "sonner";
import { Info, CheckCircle, AlertTriangle, XCircle } from "lucide-react";

const MAX_VISIBLE = 3;
const activeToasts: (string | number)[] = [];

function removeFromQueue(id: string | number) {
  const i = activeToasts.indexOf(id);
  if (i !== -1) activeToasts.splice(i, 1);
}

// ─── Config par type — couleurs Noir Terminal ───────────

type ToastType = "info" | "success" | "warning" | "error";

const typeConfig: Record<ToastType, {
  icon: React.ComponentType<{ size?: number; color?: string; style?: React.CSSProperties }>;
  borderColor: string;
  barColor: string;
  duration: number | null;
}> = {
  info:    { icon: Info,          borderColor: "#5588ff", barColor: "#5588ff", duration: 4000 },
  success: { icon: CheckCircle,   borderColor: "#00ff88", barColor: "#00ff88", duration: 4000 },
  warning: { icon: AlertTriangle, borderColor: "#ff9900", barColor: "#ff9900", duration: 7000 },
  error:   { icon: XCircle,       borderColor: "#ff4444", barColor: "#ff4444", duration: null },
};

// ─── Composant Toast custom ─────────────────────────────

function ToastContent({
  id,
  type,
  title,
  description,
}: {
  id: string | number;
  type: ToastType;
  title: string;
  description?: string;
}) {
  const cfg = typeConfig[type];
  const progressRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout>>(null);
  const startTimeRef = useRef(Date.now());
  const elapsedRef = useRef(0);
  const pausedRef = useRef(false);
  const rafRef = useRef<number>(0);

  const dismiss = () => {
    cancelAnimationFrame(rafRef.current);
    removeFromQueue(id);
    toast.dismiss(id);
  };

  const animateBar = () => {
    if (!cfg.duration || !progressRef.current || pausedRef.current) return;
    const elapsed = elapsedRef.current + (Date.now() - startTimeRef.current);
    const progress = Math.min(elapsed / cfg.duration, 1);
    progressRef.current.style.width = `${progress * 100}%`;
    if (progress < 1) {
      rafRef.current = requestAnimationFrame(animateBar);
    }
  };

  useEffect(() => {
    if (!cfg.duration) return;
    startTimeRef.current = Date.now();
    timerRef.current = setTimeout(dismiss, cfg.duration);
    rafRef.current = requestAnimationFrame(animateBar);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      cancelAnimationFrame(rafRef.current);
    };
  }, []);

  const handleMouseEnter = () => {
    if (!cfg.duration) return;
    pausedRef.current = true;
    elapsedRef.current += Date.now() - startTimeRef.current;
    if (timerRef.current) clearTimeout(timerRef.current);
    cancelAnimationFrame(rafRef.current);
  };

  const handleMouseLeave = () => {
    if (!cfg.duration) return;
    pausedRef.current = false;
    startTimeRef.current = Date.now();
    const remaining = cfg.duration - elapsedRef.current;
    if (remaining > 0) {
      timerRef.current = setTimeout(dismiss, remaining);
      rafRef.current = requestAnimationFrame(animateBar);
    } else {
      dismiss();
    }
  };

  return (
    <div
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      style={{
        background: "#111111",
        color: "#eeebe5",
        border: "1px solid #282828",
        borderLeft: `4px solid ${cfg.borderColor}`,
        borderRadius: "4px",
        padding: "12px 36px 12px 12px",
        position: "relative",
        overflow: "hidden",
        width: "356px",
        maxWidth: "calc(100vw - 40px)",
        fontFamily: "var(--font-family-mono)",
        fontSize: "12px",
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", gap: "10px" }}>
        <cfg.icon size={16} color={cfg.borderColor} style={{ flexShrink: 0, marginTop: "1px" }} />
        <div style={{ minWidth: 0 }}>
          <p style={{ fontSize: "12px", fontWeight: 600, margin: 0, lineHeight: "18px", color: "#eeebe5" }}>
            {title}
          </p>
          {description && (
            <p style={{ fontSize: "11px", color: "#8a8680", margin: "2px 0 0", lineHeight: "16px" }}>
              {description}
            </p>
          )}
        </div>
      </div>

      {/* Close button */}
      <button
        onClick={dismiss}
        style={{
          position: "absolute",
          top: "50%",
          right: "10px",
          transform: "translateY(-50%)",
          background: "none",
          border: "none",
          color: "#656159",
          cursor: "pointer",
          padding: "4px",
          lineHeight: 1,
          fontSize: "12px",
        }}
      >
        ✕
      </button>

      {/* Progress bar — se remplit de 0 à 100% */}
      {cfg.duration && (
        <div
          style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            width: "100%",
            height: "2px",
            background: "rgba(255,255,255,0.03)",
          }}
        >
          <div
            ref={progressRef}
            style={{
              height: "100%",
              width: "0%",
              background: cfg.barColor,
              transition: "none",
            }}
          />
        </div>
      )}
    </div>
  );
}

// ─── API publique — show + helpers typés ────────────────

function show(type: ToastType, title: string, description?: string) {
  if (activeToasts.length >= MAX_VISIBLE) {
    const oldest = activeToasts.shift();
    if (oldest !== undefined) toast.dismiss(oldest);
  }

  const id = toast.custom(
    (toastId) => (
      <ToastContent id={toastId} type={type} title={title} description={description} />
    ),
    { duration: Infinity },
  );

  activeToasts.push(id);
}

export const notify = {
  info:    (title: string, description?: string) => show("info", title, description),
  success: (title: string, description?: string) => show("success", title, description),
  warning: (title: string, description?: string) => show("warning", title, description),
  error:   (title: string, description?: string) => show("error", title, description),
};

// ─── Helpers spécifiques au dashboard ───────────────────

export function toastAgentSpawned(name: string) { notify.success("Agent spawned", name); }
export function toastAgentCompleted(name: string) { notify.info("Agent completed", name); }
export function toastAgentError(name: string) { notify.error("Agent error", name); }
export function toastAgentStopped(name: string) { notify.warning("Agent stopped", name); }
export function toastFolderCreated(name: string) { notify.success("Folder created", name); }
export function toastFolderDeleted(name: string) { notify.success("Folder deleted", name); }
export function toastSettingsSaved() { notify.success("Settings saved"); }

// ─── Notification sound — Web Audio API beep ────────────

export function playNotificationSound() {
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = 800;
    gain.gain.value = 0.08;
    osc.start();
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
    osc.stop(ctx.currentTime + 0.3);
  } catch {
    /* Audio not available */
  }
}
