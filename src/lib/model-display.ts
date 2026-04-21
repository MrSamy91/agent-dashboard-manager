/**
 * Convertit un ID de modèle technique en nom marketing lisible.
 * Ex: "claude-sonnet-4-6" → "Sonnet 4.6"
 *     "claude-opus-4-6[1m]" → "Opus 4.6 (1M)"
 */

const MODEL_NAMES: Record<string, string> = {
  "claude-sonnet-4-6": "Sonnet 4.6",
  "claude-opus-4-6": "Opus 4.6",
  "claude-haiku-4-5-20251001": "Haiku 4.5",
  "claude-haiku-4-5": "Haiku 4.5",
  "claude-sonnet-4-6[1m]": "Sonnet 4.6 (1M)",
  "claude-opus-4-6[1m]": "Opus 4.6 (1M)",
  "claude-opus-4-5-20250514": "Opus 4.5",
  "claude-sonnet-4-5-20250514": "Sonnet 4.5",
};

export function getModelDisplayName(model: string | undefined): string {
  if (!model) return "default";
  return MODEL_NAMES[model] || model;
}
