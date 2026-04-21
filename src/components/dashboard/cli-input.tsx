"use client";

/**
 * Input CLI-like inspiré du vrai Claude Code terminal.
 * Prompt ">" vert, slash command autocompletion (dropdown + ghost text),
 * historique de commandes (Up/Down), raccourcis clavier,
 * et model picker interactif (/model sans args).
 */

import { useState, useRef, useCallback, useEffect } from "react";
import { AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { filterCommands, MODEL_OPTIONS, type SlashCommand, type ModelOption } from "@/lib/command-registry";
import { CommandPalette } from "./command-palette";
import { ModelPickerDropdown } from "./model-picker-dropdown";

/** Suggestions ghost text après soumission */
const GHOST_SUGGESTIONS = [
  "What should I do next?",
  "Can you explain that?",
  "Show me the changes",
  "Run the tests",
  "Summarize what you did",
  "Fix the failing tests",
  "Review the code for issues",
];

interface CliInputProps {
  onSubmit: (input: string) => void;
  isRunning: boolean;
  agentName: string;
  /** Callback quand un model est sélectionné via le picker */
  onModelSelect?: (model: ModelOption) => void;
  /** Register la fonction openModelPicker pour que le parent puisse l'appeler */
  onRegisterModelPicker?: (fn: () => void) => void;
}

export function CliInput({ onSubmit, isRunning, agentName, onModelSelect, onRegisterModelPicker }: CliInputProps) {
  const [value, setValue] = useState("");
  const [ghostText, setGhostText] = useState("");

  // ─── Dropdown state : soit commands, soit model picker ───
  const [showDropdown, setShowDropdown] = useState(false);
  const [dropdownMode, setDropdownMode] = useState<"commands" | "models">("commands");
  const [filteredCmds, setFilteredCmds] = useState<SlashCommand[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // Historique de commandes (session-only)
  const historyRef = useRef<string[]>([]);
  const historyIndexRef = useRef(-1);

  const ghostTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  // ─── Ghost text ───
  const showGhostAfterDelay = useCallback(() => {
    clearTimeout(ghostTimerRef.current);
    ghostTimerRef.current = setTimeout(() => {
      const suggestion = GHOST_SUGGESTIONS[Math.floor(Math.random() * GHOST_SUGGESTIONS.length)];
      setGhostText(suggestion);
    }, 400);
  }, []);

  useEffect(() => () => clearTimeout(ghostTimerRef.current), []);

  // ─── Slash command detection ───
  useEffect(() => {
    // Ne pas interférer avec le model picker
    if (dropdownMode === "models") return;

    if (value.startsWith("/") && value.length >= 1) {
      const results = filterCommands(value);
      setFilteredCmds(results);
      setShowDropdown(results.length > 0);
      setSelectedIndex(0);
    } else {
      setShowDropdown(false);
      setFilteredCmds([]);
    }
  }, [value, dropdownMode]);

  // Effacer ghost text quand on tape
  useEffect(() => {
    if (value) setGhostText("");
  }, [value]);

  /** Ouvrir le model picker (appelé par le handler /model) */
  const openModelPicker = useCallback(() => {
    setDropdownMode("models");
    setShowDropdown(true);
    setSelectedIndex(0);
    setValue("");
    inputRef.current?.focus();
  }, []);

  /** Fermer le model picker et revenir en mode commands */
  const closeModelPicker = useCallback(() => {
    setDropdownMode("commands");
    setShowDropdown(false);
  }, []);

  // Exposer openModelPicker au parent via callback d'enregistrement
  useEffect(() => {
    onRegisterModelPicker?.(openModelPicker);
  }, [openModelPicker, onRegisterModelPicker]);

  // ─── Submit ───
  const handleSubmit = useCallback(() => {
    const trimmed = value.trim();
    if (!trimmed) return;

    historyRef.current.push(trimmed);
    historyIndexRef.current = -1;

    onSubmit(trimmed);
    setValue("");
    setShowDropdown(false);
    setDropdownMode("commands");
    showGhostAfterDelay();
  }, [value, onSubmit, showGhostAfterDelay]);

  // ─── Sélectionner une commande ───
  const selectCommand = useCallback((cmd: SlashCommand) => {
    setValue(cmd.name + " ");
    setShowDropdown(false);
    inputRef.current?.focus();
  }, []);

  // ─── Sélectionner un modèle ───
  const selectModel = useCallback((model: ModelOption) => {
    closeModelPicker();
    onModelSelect?.(model);
  }, [closeModelPicker, onModelSelect]);

  // ─── Ghost text ───
  const acceptGhost = useCallback(() => {
    if (ghostText && !value) {
      setValue(ghostText);
      setGhostText("");
    }
  }, [ghostText, value]);

  // ─── Historique ───
  const navigateHistory = useCallback((direction: "up" | "down") => {
    const history = historyRef.current;
    if (history.length === 0) return;

    if (direction === "up") {
      const newIndex = historyIndexRef.current === -1
        ? history.length - 1
        : Math.max(0, historyIndexRef.current - 1);
      historyIndexRef.current = newIndex;
      setValue(history[newIndex]);
    } else {
      if (historyIndexRef.current === -1) return;
      const newIndex = historyIndexRef.current + 1;
      if (newIndex >= history.length) {
        historyIndexRef.current = -1;
        setValue("");
      } else {
        historyIndexRef.current = newIndex;
        setValue(history[newIndex]);
      }
    }
  }, []);

  // Nombre max d'items dans le dropdown actif
  const maxIndex = dropdownMode === "models"
    ? MODEL_OPTIONS.length - 1
    : filteredCmds.length - 1;

  // ─── Keyboard ───
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.ctrlKey && e.key === "c") {
      e.preventDefault();
      onSubmit("/stop");
      return;
    }

    if (e.key === "Tab") {
      e.preventDefault();
      if (showDropdown) {
        if (dropdownMode === "models") {
          selectModel(MODEL_OPTIONS[selectedIndex]);
        } else if (filteredCmds[selectedIndex]) {
          selectCommand(filteredCmds[selectedIndex]);
        }
      } else {
        acceptGhost();
      }
      return;
    }

    if (e.key === "ArrowRight" && !value && ghostText) {
      e.preventDefault();
      acceptGhost();
      return;
    }

    if (e.key === "Escape") {
      if (showDropdown) {
        if (dropdownMode === "models") {
          closeModelPicker();
        } else {
          setShowDropdown(false);
        }
      } else {
        setValue("");
        setGhostText("");
      }
      return;
    }

    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (showDropdown) {
        if (dropdownMode === "models") {
          selectModel(MODEL_OPTIONS[selectedIndex]);
        } else if (filteredCmds[selectedIndex]) {
          // Enter sur une commande = exécuter directement (pas juste remplir l'input)
          // Tab = autocompléter (mettre dans l'input pour ajouter des args)
          const cmd = filteredCmds[selectedIndex];
          setValue("");
          setShowDropdown(false);
          onSubmit(cmd.name);
        }
      } else {
        handleSubmit();
      }
      return;
    }

    if (e.key === "ArrowUp") {
      e.preventDefault();
      if (showDropdown) {
        setSelectedIndex((prev) => Math.max(0, prev - 1));
      } else {
        navigateHistory("up");
      }
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (showDropdown) {
        setSelectedIndex((prev) => Math.min(maxIndex, prev + 1));
      } else {
        navigateHistory("down");
      }
      return;
    }
  }, [showDropdown, dropdownMode, filteredCmds, selectedIndex, maxIndex, value, ghostText, selectCommand, selectModel, acceptGhost, handleSubmit, navigateHistory, closeModelPicker, onSubmit]);

  return (
    <div className="relative flex-shrink-0 border-t border-noir-border">
      {/* Dropdown : soit command palette, soit model picker */}
      <AnimatePresence>
        {showDropdown && dropdownMode === "commands" && (
          <CommandPalette
            commands={filteredCmds}
            selectedIndex={selectedIndex}
            onSelect={selectCommand}
            onHover={setSelectedIndex}
          />
        )}
        {showDropdown && dropdownMode === "models" && (
          <ModelPickerDropdown
            models={MODEL_OPTIONS}
            selectedIndex={selectedIndex}
            onSelect={selectModel}
            onHover={setSelectedIndex}
          />
        )}
      </AnimatePresence>

      {/* Input row */}
      <div className="flex items-center gap-2 px-4 py-2">
        <span className={cn(
          "flex-shrink-0 font-mono text-sm font-bold select-none",
          dropdownMode === "models" ? "text-status-completed" : isRunning ? "text-warm-500 animate-pulse-neon" : "text-neon"
        )}>
          {dropdownMode === "models" ? "?" : ">"}
        </span>

        <div className="relative flex-1 min-w-0">
          <input
            ref={inputRef}
            type="text"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              dropdownMode === "models"
                ? "Select a model (↑↓ Enter)"
                : isRunning
                  ? `${agentName} is working...`
                  : "type a message or / for commands"
            }
            className="w-full bg-transparent font-mono text-xs text-warm-100 outline-none placeholder:text-warm-600"
            autoComplete="off"
            spellCheck={false}
          />

          {ghostText && !value && dropdownMode !== "models" && (
            <span className="pointer-events-none absolute inset-0 flex items-center font-mono text-xs text-warm-600/40">
              {ghostText}
              <span className="ml-2 text-[9px] text-warm-700">Tab</span>
            </span>
          )}
        </div>

        {dropdownMode === "models" && (
          <span className="flex-shrink-0 font-mono text-[9px] text-warm-600">
            Esc to cancel
          </span>
        )}
        {dropdownMode !== "models" && isRunning && (
          <span className="flex-shrink-0 font-mono text-[9px] text-warm-600">
            Ctrl+C to stop
          </span>
        )}
      </div>
    </div>
  );
}

/**
 * Hook pour exposer openModelPicker au parent.
 * Usage: le parent passe ce ref au CliInput et le handler /model l'appelle.
 */
export type CliInputHandle = {
  openModelPicker: () => void;
};
