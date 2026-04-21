"use client";

/**
 * Dropdown flottant d'autocompletion pour les slash commands.
 * Apparaît au-dessus de l'input quand l'utilisateur tape "/".
 * Navigation clavier (Up/Down) + clic pour sélectionner.
 */

import { useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import type { SlashCommand } from "@/lib/command-registry";

interface CommandPaletteProps {
  commands: SlashCommand[];
  selectedIndex: number;
  onSelect: (command: SlashCommand) => void;
  onHover: (index: number) => void;
}

/** Badge de catégorie compact */
function CategoryBadge({ category }: { category: string }) {
  return (
    <span className="flex-shrink-0 font-mono text-[8px] uppercase tracking-wider text-warm-600 bg-noir-elevated px-1.5 py-0.5">
      {category}
    </span>
  );
}

export function CommandPalette({ commands, selectedIndex, onSelect, onHover }: CommandPaletteProps) {
  const listRef = useRef<HTMLDivElement>(null);
  const selectedRef = useRef<HTMLDivElement>(null);

  // Scroll l'item sélectionné dans la vue quand on navigue au clavier
  useEffect(() => {
    selectedRef.current?.scrollIntoView({ block: "nearest" });
  }, [selectedIndex]);

  if (commands.length === 0) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 8 }}
      transition={{ duration: 0.12, ease: [0.23, 1, 0.32, 1] }}
      ref={listRef}
      className="absolute bottom-full left-0 right-0 mb-1 z-20 max-h-[240px] overflow-y-auto border border-noir-border bg-noir-card shadow-xl shadow-black/40 custom-scrollbar"
    >
      {commands.map((cmd, i) => {
        const isSelected = i === selectedIndex;
        return (
          <div
            key={cmd.name}
            ref={isSelected ? selectedRef : null}
            onMouseEnter={() => onHover(i)}
            onClick={() => onSelect(cmd)}
            className={cn(
              "flex items-center gap-3 px-3 py-1.5 cursor-pointer transition-colors",
              isSelected
                ? "bg-neon/5 border-l-2 border-neon"
                : "border-l-2 border-transparent hover:bg-noir-elevated"
            )}
          >
            {/* Nom de la commande */}
            <span className={cn(
              "flex-shrink-0 font-mono text-xs",
              isSelected ? "text-neon" : "text-warm-300"
            )}>
              {cmd.name}
            </span>

            {/* Description */}
            <span className="min-w-0 flex-1 truncate font-mono text-[10px] text-warm-500">
              {cmd.description}
            </span>

            {/* Badge catégorie */}
            <CategoryBadge category={cmd.category} />
          </div>
        );
      })}
    </motion.div>
  );
}
