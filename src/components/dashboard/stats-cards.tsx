"use client";

import { useMemo } from "react";
import { motion } from "framer-motion";
import { formatCost } from "@/lib/utils";
import type { AgentState } from "@/lib/agent-orchestrator";

interface StatsCardsProps {
  agents: AgentState[];
}

/**
 * Stats en grands chiffres serif — typographie dramatique.
 * Le contraste entre les gros chiffres serif et les petits labels mono
 * crée la tension visuelle qui rend ce dashboard mémorable.
 *
 * Les stats sont mémoizées : le recalcul O(n) n'est déclenché que si
 * la liste des agents change, pas à chaque re-render parent.
 */
export function StatsCards({ agents }: StatsCardsProps) {
  // useMemo évite 4 passes O(n) sur le tableau à chaque re-render du parent
  const { running, completed, failed, totalCost } = useMemo(() => {
    let running = 0, completed = 0, failed = 0, totalCost = 0;
    for (const a of agents) {
      if (a.status === "running" || a.status === "pending") running++;
      else if (a.status === "completed") completed++;
      else if (a.status === "error" || a.status === "stopped") failed++;
      totalCost += a.costUsd;
    }
    return { running, completed, failed, totalCost };
  }, [agents]);

  const stats = [
    { value: String(running), label: "running", color: "text-neon", glow: running > 0 },
    { value: String(completed), label: "completed", color: "text-status-completed" },
    { value: String(failed), label: "failed", color: "text-status-error" },
    { value: formatCost(totalCost), label: "total cost", color: "text-warm-200" },
  ];

  return (
    <div className="border-b border-noir-border">
      <div className="mx-auto flex max-w-[1600px] items-end gap-12 px-8 py-5">
        {stats.map((stat, i) => (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.06, duration: 0.5, ease: [0.23, 1, 0.32, 1] }}
            className="group"
          >
            {/* Grand chiffre en serif — l'élément visuel dominant */}
            <p
              className={`font-display text-4xl tabular-nums leading-none ${stat.color} ${
                stat.glow ? "drop-shadow-[0_0_12px_#00ff8830]" : ""
              }`}
            >
              {stat.value}
            </p>
            {/* Label en mono — contraste de taille et de style */}
            <p className="mt-1.5 font-mono text-[10px] uppercase tracking-[0.15em] text-warm-500">
              {stat.label}
            </p>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
