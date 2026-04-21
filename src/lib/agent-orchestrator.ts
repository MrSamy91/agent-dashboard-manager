/**
 * Orchestrateur d'agents Claude — coeur du dashboard.
 *
 * Gère le cycle de vie complet des agents : spawn, stream, stop, resume.
 * Supporte deux modes :
 *   - "mock"  : simule des agents pour tester le dashboard sans clé API
 *   - "real"  : utilise le Claude Agent SDK pour de vrais agents autonomes
 *
 * Le state est en mémoire (Map). En prod, on migrerait vers Redis ou une DB.
 */

import { readdir, readFile, stat, writeFile } from "fs/promises";
import { join } from "path";
import { homedir } from "os";

// ─── Types ──────────────────────────────────────────────────

export interface Folder {
  id: string;
  name: string;
}

export interface AgentMessage {
  /** ID unique — permet une déduplication fiable côté client */
  id: string;
  timestamp: number;
  type: "text" | "tool_use" | "tool_result" | "error" | "system";
  content: string;
  toolName?: string;
}

/**
 * Taille max du buffer circulaire par agent.
 * Au-delà, les messages les plus anciens sont supprimés pour éviter
 * les fuites mémoire sur des agents long-running.
 */
const MAX_OUTPUT_MESSAGES = 1000;

export interface AgentState {
  id: string;
  name: string;
  prompt: string;
  status: "pending" | "running" | "completed" | "error" | "stopped";
  output: AgentMessage[];
  sessionId?: string;
  costUsd: number;
  startedAt: number;
  completedAt?: number;
  tools: string[];
  workingDirectory: string;
  /** Modèle Claude utilisé (ex: "claude-sonnet-4-6") — renseigné par le SDK init */
  model?: string;
  /** Dossier parent — undefined = agent orphelin (non classé) */
  folderId?: string;
}

export interface SpawnTask {
  name: string;
  prompt: string;
  tools: string[];
  workingDirectory?: string;
  /** Charger les settings user/project/local (CLAUDE.md, rules, etc.) */
  loadSettings?: boolean;
  /** Modèle Claude à utiliser (ex: "claude-sonnet-4-5-20250929") */
  model?: string;
  /** Budget max en USD — l'agent s'arrête s'il dépasse */
  maxBudgetUsd?: number;
  /** Mode de permissions : default, acceptEdits, bypassPermissions, plan, dontAsk */
  permissionMode?: "default" | "acceptEdits" | "bypassPermissions" | "plan" | "dontAsk";
  /** Reprendre une session existante par ID */
  resumeSessionId?: string;
  /** Continuer la dernière session dans le working directory */
  continueLastSession?: boolean;
  /** Dossier dans lequel placer l'agent au spawn */
  folderId?: string;
}

type EventCallback = (event: AgentMessage) => void;

/** Chemin de persistence des dossiers (meme pattern que settings.json) */
const FOLDERS_PATH = join(process.cwd(), "folders.json");

// ─── Orchestrateur ──────────────────────────────────────────

class AgentOrchestrator {
  private agents = new Map<string, AgentState>();
  private folders = new Map<string, Folder>();
  private subscribers = new Map<string, Set<EventCallback>>();
  private abortControllers = new Map<string, AbortController>();

  /**
   * Promise qui garantit que les folders sont chargés depuis le disque.
   * Lancée dans le constructor (pas de await possible),
   * attendue dans chaque méthode folder avant d'accéder à this.folders.
   */
  private foldersReady: Promise<void>;

  constructor() {
    this.foldersReady = this.loadFolders();
  }

  /** Spawner un nouvel agent et lancer son exécution en background */
  async spawn(task: SpawnTask): Promise<string> {
    const id = crypto.randomUUID();
    console.log(`[orchestrator] spawn name="${task.name}" model=${task.model || "default"} tools=[${task.tools.join(",")}] cwd=${task.workingDirectory || "cwd"} folder=${task.folderId || "none"}`);

    const agent: AgentState = {
      id,
      name: task.name,
      prompt: task.prompt,
      status: "pending",
      output: [],
      // Si on reprend une session existante, sauvegarder son UUID immédiatement
      // pour que resume() puisse l'utiliser même si le premier run crash
      sessionId: task.resumeSessionId,
      costUsd: 0,
      startedAt: Date.now(),
      tools: task.tools,
      workingDirectory: task.workingDirectory || process.cwd(),
      folderId: task.folderId,
    };

    this.agents.set(id, agent);
    this.abortControllers.set(id, new AbortController());

    // Lancer l'agent en background (ne bloque pas le spawn)
    this.run(id, task).catch((err) => {
      const a = this.agents.get(id);
      if (a) {
        a.status = "error";
        a.completedAt = Date.now();
        this.emit(id, {
          timestamp: Date.now(),
          type: "error",
          content: `Agent crashed: ${err instanceof Error ? err.message : String(err)}`,
        });
      }
    });

    return id;
  }

  /** Stopper un agent en cours */
  stop(id: string): boolean {
    const controller = this.abortControllers.get(id);
    const agent = this.agents.get(id);
    if (!controller || !agent) return false;
    console.log(`[orchestrator] stop agent=${id} name="${agent.name}" status=${agent.status}`);

    controller.abort();
    agent.status = "stopped";
    agent.completedAt = Date.now();
    this.emit(id, {
      timestamp: Date.now(),
      type: "system",
      content: "Agent stopped by user",
    });
    return true;
  }

  /** Reprendre une conversation avec un agent terminé via son sessionId */
  async resume(id: string, message: string): Promise<void> {
    const agent = this.agents.get(id);
    if (!agent) throw new Error("Agent not found");
    if (!agent.sessionId) throw new Error("No session to resume");
    console.log(`[orchestrator] resume agent=${id} name="${agent.name}" model=${agent.model || "default"} session=${agent.sessionId} message="${message.slice(0, 60)}"`);

    // Le SDK exige un UUID valide pour le resume
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(agent.sessionId)) {
      throw new Error(`Invalid session ID "${agent.sessionId}" — not a UUID. Only real SDK sessions can be resumed.`);
    }

    // Remettre l'agent en mode running
    agent.status = "running";
    agent.completedAt = undefined;

    // Nouveau controller pour pouvoir stopper la reprise
    const controller = new AbortController();
    this.abortControllers.set(id, controller);

    this.emit(id, {
      timestamp: Date.now(),
      type: "system",
      content: `Resuming session ${agent.sessionId.slice(0, 12)}...`,
    });

    // Envoyer le message utilisateur dans l'output pour la traçabilité
    this.emit(id, {
      timestamp: Date.now(),
      type: "text",
      content: `> ${message}`,
    });

    const mode = process.env.AGENT_MODE || "mock";

    if (mode === "real") {
      this.resumeReal(id, agent, message, controller).catch((err) => {
        agent.status = "error";
        agent.completedAt = Date.now();
        this.emit(id, {
          timestamp: Date.now(),
          type: "error",
          content: `Resume failed: ${err instanceof Error ? err.message : String(err)}`,
        });
      });
    } else {
      // En mock, simuler une réponse
      this.resumeMock(id, agent, message, controller);
    }
  }

  /** Récupérer tous les agents (triés par date, les plus récents en premier) */
  getAll(): AgentState[] {
    return Array.from(this.agents.values()).sort(
      (a, b) => b.startedAt - a.startedAt
    );
  }

  /** Récupérer un agent par ID */
  getById(id: string): AgentState | undefined {
    return this.agents.get(id);
  }

  /** Renommer un agent */
  rename(id: string, newName: string): boolean {
    const agent = this.agents.get(id);
    if (!agent) return false;
    agent.name = newName;
    return true;
  }

  /** Supprimer un agent terminé de la liste */
  remove(id: string): boolean {
    this.subscribers.delete(id);
    this.abortControllers.delete(id);
    return this.agents.delete(id);
  }

  // ─── Folder CRUD ──────────────────────────────────────────

  /** Créer un nouveau dossier */
  async createFolder(name: string): Promise<Folder> {
    await this.foldersReady;
    const folder: Folder = { id: crypto.randomUUID(), name };
    this.folders.set(folder.id, folder);
    await this.saveFolders();
    return folder;
  }

  /** Récupérer tous les dossiers */
  async getAllFolders(): Promise<Folder[]> {
    await this.foldersReady;
    return Array.from(this.folders.values());
  }

  /** Renommer un dossier */
  async renameFolder(id: string, newName: string): Promise<boolean> {
    await this.foldersReady;
    const folder = this.folders.get(id);
    if (!folder) return false;
    folder.name = newName;
    await this.saveFolders();
    return true;
  }

  /** Supprimer un dossier — les agents dedans deviennent orphelins */
  async removeFolder(id: string): Promise<boolean> {
    await this.foldersReady;
    if (!this.folders.delete(id)) return false;
    // Désassigner tous les agents qui pointaient vers ce folder
    for (const agent of this.agents.values()) {
      if (agent.folderId === id) agent.folderId = undefined;
    }
    await this.saveFolders();
    return true;
  }

  /** Assigner un agent à un dossier (ou le désassigner avec undefined) */
  assignAgentToFolder(agentId: string, folderId: string | undefined): boolean {
    const agent = this.agents.get(agentId);
    if (!agent) return false;
    agent.folderId = folderId;
    return true;
  }

  /** S'abonner aux messages temps réel d'un agent (retourne unsubscribe) */
  subscribe(id: string, callback: EventCallback): () => void {
    if (!this.subscribers.has(id)) {
      this.subscribers.set(id, new Set());
    }
    this.subscribers.get(id)!.add(callback);

    return () => {
      this.subscribers.get(id)?.delete(callback);
    };
  }

  // ─── Privé ──────────────────────────────────────────────

  /** Charger les dossiers depuis folders.json au démarrage */
  private async loadFolders(): Promise<void> {
    try {
      const raw = await readFile(FOLDERS_PATH, "utf-8");
      const arr = JSON.parse(raw) as Folder[];
      for (const f of arr) this.folders.set(f.id, f);
    } catch {
      // Fichier inexistant ou invalide — on démarre avec une Map vide
    }
  }

  /** Persister les dossiers sur disque (JSON array) */
  private async saveFolders(): Promise<void> {
    const arr = Array.from(this.folders.values());
    await writeFile(FOLDERS_PATH, JSON.stringify(arr, null, 2), "utf-8");
  }

  /**
   * Résoudre le vrai UUID de session depuis ~/.claude/projects/.
   * Le cwd est encodé : C:\dev\portfolio → C--dev-portfolio
   * Retourne le UUID de la session la plus récente pour ce projet.
   */
  private async resolveSessionUuid(cwd: string): Promise<string | null> {
    try {
      // Encoder le cwd vers le format de dossier Claude
      // C:\dev\portfolio ou C:/dev/portfolio → C--dev-portfolio
      const normalized = cwd
        .replace(/\\/g, "/")         // backslash → forward slash
        .replace(/^([A-Za-z]):/, "$1") // C: → C
        .replace(/\//g, "-");        // / → -
      const projectDir = join(homedir(), ".claude", "projects", normalized);

      const files = await readdir(projectDir);
      const jsonlFiles = files.filter((f) => f.endsWith(".jsonl"));

      if (jsonlFiles.length === 0) return null;

      // Trouver le fichier .jsonl le plus récent
      let latestFile = jsonlFiles[0];
      let latestTime = 0;

      for (const file of jsonlFiles) {
        const fileStat = await stat(join(projectDir, file)).catch(() => null);
        if (fileStat && fileStat.mtimeMs > latestTime) {
          latestTime = fileStat.mtimeMs;
          latestFile = file;
        }
      }

      return latestFile.replace(".jsonl", "");
    } catch {
      return null;
    }
  }

  /** Émettre un message à tous les subscribers d'un agent */
  private emit(id: string, message: Omit<AgentMessage, "id">) {
    // Enrichir le message avec un ID unique et stable
    const enriched: AgentMessage = { ...message, id: crypto.randomUUID() };

    const agent = this.agents.get(id);
    if (agent) {
      agent.output.push(enriched);

      // Buffer circulaire : garder seulement les MAX_OUTPUT_MESSAGES derniers messages
      // pour éviter une fuite mémoire sur des agents qui tournent longtemps
      if (agent.output.length > MAX_OUTPUT_MESSAGES) {
        agent.output = agent.output.slice(-MAX_OUTPUT_MESSAGES);
      }
    }

    const subs = this.subscribers.get(id);
    if (subs) {
      for (const cb of subs) {
        try { cb(enriched); } catch { /* subscriber errors shouldn't crash orchestrator */ }
      }
    }
  }

  /** Router vers le bon mode d'exécution */
  private async run(id: string, task: SpawnTask): Promise<void> {
    const mode = process.env.AGENT_MODE || "mock";

    if (mode === "real") {
      await this.runReal(id, task);
    } else {
      await this.runMock(id, task);
    }
  }

  /** Mode réel — utilise le Claude Agent SDK */
  private async runReal(id: string, task: SpawnTask): Promise<void> {
    const agent = this.agents.get(id)!;
    const controller = this.abortControllers.get(id)!;

    agent.status = "running";

    const sources = task.loadSettings !== false
      ? ["user", "project", "local"] as const
      : ([] as const);

    const permMode = task.permissionMode || "acceptEdits";
    const isBypass = permMode === "bypassPermissions";

    // ─── Résoudre le vrai UUID de session ───
    // Si resumeSessionId est fourni, vérifier si c'est un UUID valide.
    // Sinon, chercher le UUID depuis ~/.claude/projects/ à partir du cwd.
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    let resolvedSessionId: string | undefined;

    if (task.resumeSessionId && uuidRegex.test(task.resumeSessionId)) {
      // UUID valide fourni directement
      resolvedSessionId = task.resumeSessionId;
    } else if (task.resumeSessionId || task.continueLastSession) {
      // Pas un UUID valide ou continueLastSession → chercher sur le filesystem
      const found = await this.resolveSessionUuid(task.workingDirectory || process.cwd());
      if (found && uuidRegex.test(found)) {
        resolvedSessionId = found;
      }
    }

    // Sauvegarder sur l'agent pour le resume futur via chat
    if (resolvedSessionId) {
      agent.sessionId = resolvedSessionId;
    }

    this.emit(id, {
      timestamp: Date.now(),
      type: "system",
      content: [
        resolvedSessionId ? `Resuming session ${resolvedSessionId.slice(0, 8)}...`
          : task.continueLastSession ? `Continuing last session...`
          : `Agent starting in real mode`,
        `  cwd: ${task.workingDirectory}`,
        resolvedSessionId ? `  session: ${resolvedSessionId}` : null,
        `  permissions: ${permMode}${isBypass ? " ⚠️" : ""}`,
        `  settingSources: [${sources.join(", ")}]${sources.length > 0 ? " (CLAUDE.md + rules)" : " (isolation)"}`,
        task.model ? `  model: ${task.model}` : null,
        task.maxBudgetUsd ? `  maxBudget: $${task.maxBudgetUsd}` : null,
      ].filter(Boolean).join("\n"),
    });

    try {
      const { query } = await import("@anthropic-ai/claude-agent-sdk");

      for await (const message of query({
        prompt: task.prompt,
        options: {
          allowedTools: task.tools,
          permissionMode: permMode,
          cwd: task.workingDirectory,
          abortController: controller,
          settingSources: sources.length > 0 ? [...sources] : [],
          systemPrompt: { type: "preset", preset: "claude_code" },

          // Fix Windows ENOENT : passer explicitement l'env + le chemin node
          env: process.env as Record<string, string>,
          executable: "node",

          // Capturer stderr pour voir les vraies erreurs du process Claude Code
          stderr: (data: string) => {
            const trimmed = data.trim();
            if (trimmed) {
              this.emit(id, {
                timestamp: Date.now(),
                type: "error",
                content: `[stderr] ${trimmed}`,
              });
            }
          },

          ...(isBypass && { allowDangerouslySkipPermissions: true }),
          ...(task.model && { model: task.model }),
          ...(task.maxBudgetUsd && { maxBudgetUsd: task.maxBudgetUsd }),
          // Utiliser le UUID résolu (vérifié valide) ou continue: true en fallback
          ...(resolvedSessionId
            ? { resume: resolvedSessionId }
            : task.continueLastSession ? { continue: true } : {}),
        },
      })) {
        if (controller.signal.aborted) break;

        // Capturer le session_id depuis n'importe quel message SDK
        // (tous les messages ont session_id — le premier reçu est le bon)
        const msgSessionId = (message as { session_id?: string }).session_id;
        if (msgSessionId && !agent.sessionId) {
          agent.sessionId = msgSessionId;
        }

        // Messages assistant — contiennent du texte et des appels d'outils
        if (message.type === "assistant") {
          const content = (message as { message?: { content?: Array<Record<string, unknown>> } }).message?.content;
          if (Array.isArray(content)) {
            for (const block of content) {
              if (block.type === "text" && typeof block.text === "string") {
                this.emit(id, {
                  timestamp: Date.now(),
                  type: "text",
                  content: block.text,
                });
              }
              if (block.type === "tool_use") {
                this.emit(id, {
                  timestamp: Date.now(),
                  type: "tool_use",
                  content: `Calling ${block.name}(${JSON.stringify(block.input).slice(0, 100)}...)`,
                  toolName: String(block.name),
                });
              }
            }
          }
        }

        // tool_progress — progression des outils en cours d'exécution
        if (message.type === "tool_progress") {
          const prog = message as { tool_name?: string; elapsed_time_seconds?: number };
          this.emit(id, {
            timestamp: Date.now(),
            type: "tool_result",
            content: `Tool ${prog.tool_name} running (${prog.elapsed_time_seconds}s)...`,
            toolName: prog.tool_name,
          });
        }

        // system init — le SDK confirme la config effective de l'agent
        if (message.type === "system") {
          const sys = message as {
            subtype?: string;
            model?: string;
            tools?: string[];
            skills?: string[];
            permissionMode?: string;
            cwd?: string;
            slash_commands?: string[];
            output_style?: string;
          };

          if (sys.subtype === "init") {
            // Capturer le modèle reporté par le SDK
            if (sys.model) {
              console.log(`[orchestrator] SDK init agent=${id} model=${sys.model} (was ${agent.model || "unset"})`);
              agent.model = sys.model;
            }
            // Le message init prouve que le SDK a chargé la config
            // Si CLAUDE.md est loaded, les skills/slash_commands refletent son contenu
            this.emit(id, {
              timestamp: Date.now(),
              type: "system",
              content: [
                `SDK connected`,
                `  model: ${sys.model}`,
                `  tools: ${sys.tools?.join(", ")}`,
                `  permissions: ${sys.permissionMode}`,
                sys.skills?.length ? `  skills: ${sys.skills.join(", ")}` : null,
                sys.slash_commands?.length ? `  commands: ${sys.slash_commands.join(", ")}` : null,
                sys.output_style ? `  style: ${sys.output_style}` : null,
              ].filter(Boolean).join("\n"),
            });
          }
        }

        // Résultat final — l'agent a terminé
        if (message.type === "result") {
          console.log(`[orchestrator] result agent=${id} model=${agent.model} type=${(message as { subtype?: string }).subtype} cost=$${(message as { total_cost_usd?: number }).total_cost_usd}`);
          const result = message as {
            session_id?: string;
            total_cost_usd?: number;
            subtype?: string;
            result?: string;
          };
          agent.sessionId = result.session_id;
          agent.costUsd = result.total_cost_usd ?? 0;
          agent.status = result.subtype === "success" ? "completed" : "error";
          agent.completedAt = Date.now();
          // NE PAS émettre result.result ici — le texte a déjà été émis
          // par le handler "assistant" au-dessus. L'émettre ici causerait
          // un doublon visible dans le terminal.
        }
      }
    } catch (err) {
      if (!controller.signal.aborted) {
        agent.status = "error";
        agent.completedAt = Date.now();
        this.emit(id, {
          timestamp: Date.now(),
          type: "error",
          content: `SDK error: ${err instanceof Error ? err.message : String(err)}`,
        });
      }
    }
  }

  /** Mode mock — simule un agent avec des messages réalistes */
  private async runMock(id: string, task: SpawnTask): Promise<void> {
    const agent = this.agents.get(id)!;
    const controller = this.abortControllers.get(id)!;

    agent.status = "running";
    agent.sessionId = `mock-session-${id.slice(0, 8)}`;
    agent.model = task.model || "claude-sonnet-4-6";

    // Script de messages mock qui simule un vrai agent au travail
    const mockScript: Array<{ delay: number; msg: Omit<AgentMessage, "id" | "timestamp"> }> = [
      { delay: 300, msg: { type: "system", content: "Initializing agent..." } },
      { delay: 800, msg: { type: "text", content: `Starting task: ${task.prompt.slice(0, 80)}` } },
      { delay: 1200, msg: { type: "tool_use", content: 'Glob("**/*.{ts,tsx}")', toolName: "Glob" } },
      { delay: 600, msg: { type: "tool_result", content: "Found 47 matching files across 12 directories" } },
      { delay: 1500, msg: { type: "text", content: "Let me examine the key files in the project structure..." } },
      { delay: 800, msg: { type: "tool_use", content: 'Read("src/app/layout.tsx")', toolName: "Read" } },
      { delay: 500, msg: { type: "tool_result", content: "File read successfully (42 lines)" } },
      { delay: 1000, msg: { type: "tool_use", content: 'Grep("TODO|FIXME|HACK", "**/*.ts")', toolName: "Grep" } },
      { delay: 700, msg: { type: "tool_result", content: "Found 8 matches in 5 files" } },
      { delay: 2000, msg: { type: "text", content: "I've identified several areas that need attention:\n\n1. **Authentication flow** — Missing rate limiting on login endpoint\n2. **Database queries** — 3 potential N+1 query issues in the user module\n3. **Error handling** — Several unhandled promise rejections in API routes\n4. **Type safety** — 12 uses of `any` type that should be properly typed" } },
      { delay: 1200, msg: { type: "tool_use", content: 'Read("src/lib/auth/config.ts")', toolName: "Read" } },
      { delay: 500, msg: { type: "tool_result", content: "File read successfully (87 lines)" } },
      { delay: 1800, msg: { type: "text", content: "The auth configuration is using a weak hashing algorithm. Let me fix that..." } },
      { delay: 1000, msg: { type: "tool_use", content: 'Edit("src/lib/auth/config.ts")', toolName: "Edit" } },
      { delay: 600, msg: { type: "tool_result", content: "File edited successfully — replaced bcrypt rounds from 8 to 12" } },
      { delay: 1500, msg: { type: "text", content: "Now checking the database query patterns for optimization..." } },
      { delay: 800, msg: { type: "tool_use", content: 'Grep("findMany|findFirst", "**/*.ts")', toolName: "Grep" } },
      { delay: 500, msg: { type: "tool_result", content: "Found 23 matches in 9 files" } },
      { delay: 2000, msg: { type: "text", content: "Analysis complete. Here's my summary:\n\n**Fixed:**\n- Upgraded bcrypt rounds from 8 to 12\n- Added missing error boundaries\n\n**Recommendations:**\n- Add rate limiting to `/api/auth/login`\n- Implement query batching for user-related queries\n- Replace `any` types with proper interfaces\n- Add input validation with Zod on all API routes\n\n**Risk level:** Medium — no critical vulnerabilities, but several improvements needed." } },
      { delay: 500, msg: { type: "system", content: "Task completed successfully" } },
    ];

    // Simuler un coût qui augmente progressivement
    let accumulatedCost = 0;

    for (const step of mockScript) {
      // Vérifier si l'agent a été stoppé
      if (controller.signal.aborted) return;

      // Attendre le délai simulé
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(resolve, step.delay);
        controller.signal.addEventListener("abort", () => {
          clearTimeout(timeout);
          reject(new Error("aborted"));
        }, { once: true });
      }).catch(() => { return; });

      if (controller.signal.aborted) return;

      // Incrémenter le coût de façon réaliste
      accumulatedCost += Math.random() * 0.03 + 0.005;
      agent.costUsd = Math.round(accumulatedCost * 1000) / 1000;

      this.emit(id, { ...step.msg, timestamp: Date.now() });
    }

    // Finaliser l'agent
    if (!controller.signal.aborted) {
      agent.status = "completed";
      agent.completedAt = Date.now();
    }
  }
  /** Resume réel — relance une query SDK avec l'option resume */
  private async resumeReal(
    id: string,
    agent: AgentState,
    message: string,
    controller: AbortController
  ): Promise<void> {
    try {
      const { query } = await import("@anthropic-ai/claude-agent-sdk");

      const resumeOptions: Record<string, unknown> = {
        resume: agent.sessionId,
        allowedTools: agent.tools,
        permissionMode: "acceptEdits",
        cwd: agent.workingDirectory,
        abortController: controller,
        settingSources: ["user", "project", "local"],
        systemPrompt: { type: "preset", preset: "claude_code" },
        env: process.env as Record<string, string>,
        executable: "node",
        stderr: (data: string) => {
          const trimmed = data.trim();
          if (trimmed) {
            this.emit(id, { timestamp: Date.now(), type: "error", content: `[stderr] ${trimmed}` });
          }
        },
        // Passer le modèle sélectionné pour que le SDK l'utilise
        ...(agent.model && { model: agent.model }),
      };

      console.log(`[orchestrator] resumeReal agent=${id} session=${agent.sessionId} model=${agent.model || "default"} prompt="${message.slice(0, 80)}"`);

      for await (const msg of query({
        prompt: message,
        options: resumeOptions as Parameters<typeof query>[0]["options"],
      })) {
        if (controller.signal.aborted) break;

        // Même parsing que runReal pour les messages assistant
        if (msg.type === "assistant") {
          const content = (msg as { message?: { content?: Array<Record<string, unknown>> } }).message?.content;
          if (Array.isArray(content)) {
            for (const block of content) {
              if (block.type === "text" && typeof block.text === "string") {
                this.emit(id, { timestamp: Date.now(), type: "text", content: block.text });
              }
              if (block.type === "tool_use") {
                this.emit(id, {
                  timestamp: Date.now(),
                  type: "tool_use",
                  content: `Calling ${block.name}(${JSON.stringify(block.input).slice(0, 100)}...)`,
                  toolName: String(block.name),
                });
              }
            }
          }
        }

        if (msg.type === "tool_progress") {
          const prog = msg as { tool_name?: string; elapsed_time_seconds?: number };
          this.emit(id, {
            timestamp: Date.now(),
            type: "tool_result",
            content: `Tool ${prog.tool_name} running (${prog.elapsed_time_seconds}s)...`,
            toolName: prog.tool_name,
          });
        }

        if (msg.type === "result") {
          const result = msg as { session_id?: string; total_cost_usd?: number; subtype?: string; result?: string };
          agent.sessionId = result.session_id;
          agent.costUsd = result.total_cost_usd ?? agent.costUsd;
          agent.status = result.subtype === "success" ? "completed" : "error";
          agent.completedAt = Date.now();
          // NE PAS émettre result.result — déjà émis par le handler "assistant"
        }
      }
    } catch (err) {
      if (!controller.signal.aborted) {
        agent.status = "error";
        agent.completedAt = Date.now();
        this.emit(id, {
          timestamp: Date.now(),
          type: "error",
          content: `Resume error: ${err instanceof Error ? err.message : String(err)}`,
        });
      }
    }
  }

  /** Resume mock — simule une réponse de suivi */
  private async resumeMock(
    id: string,
    agent: AgentState,
    message: string,
    controller: AbortController
  ): Promise<void> {
    const mockReplies: Array<{ delay: number; msg: Omit<AgentMessage, "id"> }> = [
      { delay: 800, msg: { timestamp: 0, type: "system", content: "Session resumed" } },
      { delay: 1500, msg: { timestamp: 0, type: "text", content: `Processing your follow-up: "${message.slice(0, 50)}..."` } },
      { delay: 1000, msg: { timestamp: 0, type: "tool_use", content: 'Grep("relevant pattern", "**/*.ts")', toolName: "Grep" } },
      { delay: 600, msg: { timestamp: 0, type: "tool_result", content: "Found 5 matches" } },
      { delay: 2000, msg: { timestamp: 0, type: "text", content: "Based on my analysis and your follow-up question, here's what I found:\n\nThe changes have been applied successfully. The previous session context was preserved, so I was able to build on my earlier findings.\n\nLet me know if you need anything else." } },
      { delay: 500, msg: { timestamp: 0, type: "system", content: "Follow-up completed" } },
    ];

    for (const step of mockReplies) {
      if (controller.signal.aborted) return;

      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(resolve, step.delay);
        controller.signal.addEventListener("abort", () => {
          clearTimeout(timeout);
          reject(new Error("aborted"));
        }, { once: true });
      }).catch(() => { return; });

      if (controller.signal.aborted) return;

      agent.costUsd += Math.random() * 0.02 + 0.003;
      this.emit(id, { ...step.msg, timestamp: Date.now() });
    }

    if (!controller.signal.aborted) {
      agent.status = "completed";
      agent.completedAt = Date.now();
    }
  }
}

// Singleton versionné — survit aux hot-reloads mais se recrée quand le code change.
// Incrémenter la version force une nouvelle instance avec les méthodes à jour.
const ORCHESTRATOR_VERSION = 5;
const globalStore = globalThis as unknown as Record<string, AgentOrchestrator | undefined>;
const globalKey = `__orchestrator_v${ORCHESTRATOR_VERSION}`;

export const orchestrator = globalStore[globalKey] ?? new AgentOrchestrator();

if (process.env.NODE_ENV !== "production") {
  globalStore[globalKey] = orchestrator;
}
