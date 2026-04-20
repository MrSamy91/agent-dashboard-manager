/** Presets d'agents pré-configurés pour le spawn rapide */
export interface AgentPreset {
  id: string;
  name: string;
  description: string;
  icon: string;        // Nom de l'icône Lucide
  prompt: string;
  tools: string[];
  color: string;       // Classe Tailwind pour l'accent
}

export const AGENT_PRESETS: AgentPreset[] = [
  {
    id: "code-review",
    name: "Code Review",
    description: "Analyse la qualité du code, les patterns et les améliorations possibles",
    icon: "Search",
    prompt: "Review the codebase for code quality issues, anti-patterns, and potential improvements. Focus on readability, maintainability, and best practices. Provide a detailed report.",
    tools: ["Read", "Glob", "Grep"],
    color: "from-violet-500/20 to-violet-600/5",
  },
  {
    id: "security-audit",
    name: "Security Audit",
    description: "Audite les vulnérabilités de sécurité (XSS, injection, CSRF, etc.)",
    icon: "Shield",
    prompt: "Perform a thorough security audit of the codebase. Check for XSS, SQL injection, CSRF, insecure dependencies, hardcoded secrets, and other OWASP Top 10 vulnerabilities. Report findings with severity levels.",
    tools: ["Read", "Glob", "Grep", "Bash"],
    color: "from-red-500/20 to-red-600/5",
  },
  {
    id: "bug-fix",
    name: "Bug Hunter",
    description: "Trouve et corrige les bugs dans le code",
    icon: "Bug",
    prompt: "Analyze the codebase for bugs, edge cases, and potential runtime errors. Fix any issues you find and explain what was wrong.",
    tools: ["Read", "Edit", "Glob", "Grep", "Bash"],
    color: "from-amber-500/20 to-amber-600/5",
  },
  {
    id: "refactor",
    name: "Refactoring",
    description: "Refactore le code pour améliorer la structure et la lisibilité",
    icon: "Sparkles",
    prompt: "Refactor the codebase to improve structure, reduce duplication, and enhance readability. Follow SOLID principles and clean code practices.",
    tools: ["Read", "Edit", "Glob", "Grep"],
    color: "from-cyan-500/20 to-cyan-600/5",
  },
  {
    id: "test-writer",
    name: "Test Writer",
    description: "Écrit des tests unitaires et d'intégration",
    icon: "FlaskConical",
    prompt: "Analyze the codebase and write comprehensive tests. Focus on critical paths, edge cases, and untested functions. Use the project's existing test framework.",
    tools: ["Read", "Write", "Edit", "Glob", "Grep", "Bash"],
    color: "from-emerald-500/20 to-emerald-600/5",
  },
  {
    id: "perf-audit",
    name: "Performance",
    description: "Analyse les problèmes de performance et optimise",
    icon: "Zap",
    prompt: "Analyze the codebase for performance issues: N+1 queries, unnecessary re-renders, large bundle sizes, missing indexes, unoptimized images, and slow algorithms. Suggest or implement fixes.",
    tools: ["Read", "Glob", "Grep", "Bash"],
    color: "from-orange-500/20 to-orange-600/5",
  },
  {
    id: "documentation",
    name: "Documentation",
    description: "Génère la documentation du code et des APIs",
    icon: "FileText",
    prompt: "Document the codebase: add JSDoc comments to key functions, create API documentation, and explain the architecture. Focus on public APIs and complex logic.",
    tools: ["Read", "Edit", "Glob", "Grep"],
    color: "from-blue-500/20 to-blue-600/5",
  },
  {
    id: "custom",
    name: "Custom",
    description: "Agent personnalisé avec ton propre prompt",
    icon: "Terminal",
    prompt: "",
    tools: ["Read", "Edit", "Write", "Glob", "Grep", "Bash"],
    color: "from-zinc-500/20 to-zinc-600/5",
  },
];

/** Liste de tous les outils disponibles pour le multi-select */
export const AVAILABLE_TOOLS = [
  "Read",
  "Write",
  "Edit",
  "Bash",
  "Glob",
  "Grep",
  "WebSearch",
  "WebFetch",
  "Agent",
] as const;
