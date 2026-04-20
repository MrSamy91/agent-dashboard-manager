"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Plus } from "lucide-react";
import { AgentCard } from "./agent-card";
import type { AgentState } from "@/lib/agent-orchestrator";

interface AgentSidebarProps {
  agents: AgentState[];
  selectedIds: string[];
  onSelect: (id: string) => void;
  onSpawn: () => void;
  onRename: (id: string, newName: string) => void;
}

export function AgentSidebar({ agents, selectedIds, onSelect, onSpawn, onRename }: AgentSidebarProps) {
  return (
    <aside className="flex h-full flex-col">
      {/* Header avec label + bouton spawn */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-noir-border">
        <div className="flex items-center gap-2">
          <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-warm-400">
            Agents
          </span>
          <span className="font-mono text-[10px] tabular-nums text-warm-500">
            {agents.length}
          </span>
        </div>

        {/* Bouton spawn compact dans la sidebar */}
        <motion.button
          onClick={onSpawn}
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.9 }}
          className="flex h-5 w-5 items-center justify-center border border-neon/20 bg-neon/5 text-neon transition-colors hover:border-neon/40 hover:bg-neon/10"
          title="Spawn new agent"
        >
          <Plus className="h-3 w-3" />
        </motion.button>
      </div>

      {/* Liste scrollable */}
      <div className="custom-scrollbar flex-1 overflow-y-auto">
        <AnimatePresence mode="popLayout">
          {agents.length === 0 ? (
            <motion.div
              key="empty"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex flex-col items-center justify-center px-5 py-20 text-center"
            >
              <pre className="font-mono text-[10px] leading-tight text-warm-500 select-none">
{`  ┌─────────┐
  │  empty  │
  └─────────┘`}
              </pre>
              <p className="mt-4 font-mono text-[10px] text-warm-400">
                no agents running
              </p>
              <p className="mt-1 font-mono text-[10px] text-warm-500">
                press <span className="text-neon/70">+</span> to start
              </p>
            </motion.div>
          ) : (
            agents.map((agent) => (
              <AgentCard
                key={agent.id}
                agent={agent}
                isSelected={selectedIds.includes(agent.id)}
                onSelect={() => onSelect(agent.id)}
                onRename={onRename}
              />
            ))
          )}
        </AnimatePresence>
      </div>
    </aside>
  );
}
