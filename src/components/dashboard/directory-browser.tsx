"use client";

/**
 * Browser de dossiers inline — permet de naviguer dans le filesystem
 * pour sélectionner un working directory au lieu de taper le chemin.
 * S'affiche sous le champ texte dans le spawn dialog.
 */

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronRight, FolderOpen, ArrowUp, Check, Loader2, Home } from "lucide-react";
import { cn } from "@/lib/utils";

interface DirectoryBrowserProps {
  /** Chemin actuellement saisi dans l'input (peut être vide) */
  currentPath: string;
  /** Callback quand l'utilisateur sélectionne un dossier */
  onSelect: (path: string) => void;
  /** Fermer le browser */
  onClose: () => void;
}

interface DirListing {
  current: string;
  parent: string | null;
  directories: string[];
  separator: string;
}

export function DirectoryBrowser({ currentPath, onSelect, onClose }: DirectoryBrowserProps) {
  const [listing, setListing] = useState<DirListing | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  /** Charger les sous-dossiers d'un chemin */
  const fetchDir = useCallback(async (path?: string) => {
    setLoading(true);
    setError(null);
    try {
      const params = path ? `?path=${encodeURIComponent(path)}` : "";
      const res = await fetch(`/api/directories${params}`);
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to list directory");
        return;
      }
      setListing(data);
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }, []);

  // Charger le dossier initial au mount
  useEffect(() => {
    fetchDir(currentPath || undefined);
  }, []);

  /** Naviguer dans un sous-dossier */
  const navigateTo = (dirName: string) => {
    if (!listing) return;
    const newPath = listing.current + listing.separator + dirName;
    fetchDir(newPath);
  };

  /** Remonter au parent */
  const navigateUp = () => {
    if (listing?.parent) fetchDir(listing.parent);
  };

  /** Aller au home */
  const navigateHome = () => fetchDir(undefined);

  /** Confirmer la sélection du dossier courant */
  const confirmSelection = () => {
    if (listing) {
      onSelect(listing.current);
      onClose();
    }
  };

  return (
    <motion.div
      initial={{ height: 0, opacity: 0 }}
      animate={{ height: "auto", opacity: 1 }}
      exit={{ height: 0, opacity: 0 }}
      transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
      className="overflow-hidden"
    >
      <div className="mt-2 border border-noir-border bg-noir-card">
        {/* ─── Header : chemin courant + actions ─── */}
        <div className="flex items-center gap-1.5 border-b border-noir-border px-3 py-2">
          {/* Bouton home */}
          <button
            onClick={navigateHome}
            className="flex h-5 w-5 items-center justify-center text-warm-500 transition-colors hover:text-warm-300"
            title="Home directory"
          >
            <Home className="h-3 w-3" />
          </button>

          {/* Bouton parent */}
          <button
            onClick={navigateUp}
            disabled={!listing?.parent}
            className="flex h-5 w-5 items-center justify-center text-warm-500 transition-colors hover:text-warm-300 disabled:opacity-30"
            title="Parent directory"
          >
            <ArrowUp className="h-3 w-3" />
          </button>

          {/* Chemin courant — breadcrumb cliquable */}
          <div className="min-w-0 flex-1 truncate font-mono text-[10px] text-warm-300">
            {listing?.current || "..."}
          </div>

          {/* Bouton sélectionner */}
          <motion.button
            onClick={confirmSelection}
            whileTap={{ scale: 0.95 }}
            disabled={!listing}
            className="flex items-center gap-1.5 border border-neon/30 bg-neon/8 px-2.5 py-1 font-mono text-[10px] text-neon transition-all hover:border-neon/50 hover:bg-neon/12 disabled:opacity-30"
          >
            <Check className="h-3 w-3" />
            select
          </motion.button>
        </div>

        {/* ─── Liste des sous-dossiers ─── */}
        <div className="custom-scrollbar max-h-48 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="h-4 w-4 animate-spin text-warm-500" />
            </div>
          ) : error ? (
            <div className="px-3 py-4 font-mono text-[10px] text-status-error">
              {error}
            </div>
          ) : listing && listing.directories.length === 0 ? (
            <div className="px-3 py-4 font-mono text-[10px] text-warm-500">
              no subdirectories
            </div>
          ) : (
            listing?.directories.map((dir) => (
              <button
                key={dir}
                onClick={() => navigateTo(dir)}
                className="group flex w-full items-center gap-2 px-3 py-1.5 text-left transition-colors hover:bg-noir-elevated"
              >
                <FolderOpen className="h-3 w-3 flex-shrink-0 text-warm-500 group-hover:text-neon/60" />
                <span className="truncate font-mono text-[11px] text-warm-300 group-hover:text-warm-100">
                  {dir}
                </span>
                <ChevronRight className="ml-auto h-3 w-3 flex-shrink-0 text-warm-600 opacity-0 group-hover:opacity-100" />
              </button>
            ))
          )}
        </div>
      </div>
    </motion.div>
  );
}
