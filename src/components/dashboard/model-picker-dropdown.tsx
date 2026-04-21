"use client";

/**
 * Picker de modèles interactif — inspiré du vrai /model de Claude Code.
 * Flotte au-dessus du CLI input, navigation Up/Down + Enter.
 */

import { useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import type { ModelOption } from "@/lib/command-registry";

interface ModelPickerDropdownProps {
  models: ModelOption[];
  selectedIndex: number;
  onSelect: (model: ModelOption) => void;
  onHover: (index: number) => void;
}

export function ModelPickerDropdown({ models, selectedIndex, onSelect, onHover }: ModelPickerDropdownProps) {
  const selectedRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    selectedRef.current?.scrollIntoView({ block: "nearest" });
  }, [selectedIndex]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 8 }}
      transition={{ duration: 0.12, ease: [0.23, 1, 0.32, 1] }}
      className="absolute bottom-full left-0 right-0 mb-1 z-20 border border-noir-border bg-noir-card shadow-xl shadow-black/40"
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-noir-border px-3 py-2">
        <span className="font-mono text-[10px] uppercase tracking-[0.15em] text-warm-400">
          Select model
        </span>
        <span className="font-mono text-[9px] text-warm-600">
          ↑↓ navigate · Enter select · Esc cancel
        </span>
      </div>

      {/* Model list */}
      <div className="custom-scrollbar max-h-[280px] overflow-y-auto">
        {models.map((model, i) => {
          const isSelected = i === selectedIndex;
          return (
            <div
              key={model.value || "__default__"}
              ref={isSelected ? selectedRef : null}
              onMouseEnter={() => onHover(i)}
              onClick={() => onSelect(model)}
              className={cn(
                "flex items-center gap-3 px-3 py-2 cursor-pointer transition-colors",
                isSelected
                  ? "bg-status-completed/5 border-l-2 border-status-completed"
                  : "border-l-2 border-transparent hover:bg-noir-elevated"
              )}
            >
              {/* Label du modèle */}
              <span className={cn(
                "flex-shrink-0 font-mono text-xs font-medium min-w-[140px]",
                isSelected ? "text-status-completed" : "text-warm-200"
              )}>
                {model.label}
              </span>

              {/* Description */}
              <span className="min-w-0 flex-1 truncate font-mono text-[10px] text-warm-500">
                {model.description}
              </span>
            </div>
          );
        })}
      </div>
    </motion.div>
  );
}
