"use client";

/**
 * Terminal output — affichage des messages d'un agent.
 * Markdown rendering pour les réponses assistant,
 * tool calls collapsibles, code blocks avec bouton copy,
 * style inspiré de Claude Code CLI.
 */

import { useEffect, useRef, useState, useCallback, memo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/utils";
import { Copy, Check, ChevronRight } from "lucide-react";
import type { AgentMessage } from "@/lib/agent-orchestrator";

/** Formatter Intl singleton — évite la recréation à chaque appel */
const TIME_FORMATTER = new Intl.DateTimeFormat("fr-FR", {
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

/** Seuil au-delà duquel les animations sont désactivées */
const ANIMATION_THRESHOLD = 50;

interface TerminalOutputProps {
  messages: AgentMessage[];
  isLive: boolean;
}

function formatTime(ts: number): string {
  return TIME_FORMATTER.format(new Date(ts));
}

/** Badge minimaliste pour chaque type de message */
function TypeTag({ type }: { type: AgentMessage["type"] }) {
  const config: Record<string, { label: string; color: string }> = {
    system:      { label: "sys",  color: "text-warm-500" },
    text:        { label: "out",  color: "text-neon/70" },
    tool_use:    { label: "call", color: "text-status-completed/70" },
    tool_result: { label: "res",  color: "text-warm-500" },
    error:       { label: "err",  color: "text-status-error/80" },
  };
  const { label, color } = config[type] || config.system;
  return (
    <span className={cn("w-8 flex-shrink-0 text-right font-mono text-[10px] uppercase", color)}>
      {label}
    </span>
  );
}

function isInitMessage(msg: AgentMessage): boolean {
  return msg.type === "system" && (
    msg.content.startsWith("SDK connected") ||
    msg.content.startsWith("Agent starting") ||
    msg.content.startsWith("Resuming session")
  );
}

function isUserMessage(msg: AgentMessage): boolean {
  return msg.type === "text" && msg.content.startsWith("> ");
}

function parseToolCall(content: string): { toolName: string; args: string } | null {
  const match = content.match(/^Calling (\w+)\((.[\s\S]+)\)$/);
  if (!match) return null;
  return { toolName: match[1], args: match[2] };
}

// ─── Code Block avec bouton Copy ───────────────────────

/** Bouton copy qui apparaît sur les code blocks */
function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }, [text]);

  return (
    <button
      onClick={handleCopy}
      className="absolute right-2 top-2 flex items-center gap-1 rounded bg-noir-elevated/80 px-1.5 py-0.5 font-mono text-[9px] text-warm-500 opacity-0 backdrop-blur transition-opacity group-hover/code:opacity-100 hover:text-warm-200"
    >
      {copied ? <Check className="h-3 w-3 text-neon" /> : <Copy className="h-3 w-3" />}
      {copied ? "copied" : "copy"}
    </button>
  );
}

// ─── Markdown renderer custom — thème Noir Terminal ─────

/** Composants custom pour react-markdown, stylés pour le thème noir */
const markdownComponents = {
  // Code blocks : fond sombre + bouton copy
  pre: ({ children, ...props }: React.ComponentPropsWithoutRef<"pre">) => {
    // Extraire le texte du code block pour le bouton copy
    const codeText = extractTextContent(children);
    return (
      <div className="group/code relative my-2">
        <pre
          className="overflow-x-auto rounded border border-noir-border bg-noir/80 px-3 py-2 font-mono text-[11px] leading-relaxed text-warm-200"
          {...props}
        >
          {children}
        </pre>
        {codeText && <CopyButton text={codeText} />}
      </div>
    );
  },
  // Inline code
  code: ({ children, className, ...props }: React.ComponentPropsWithoutRef<"code">) => {
    // Si c'est dans un <pre>, ne pas styler en inline
    if (className) {
      return <code className={cn("text-warm-200", className)} {...props}>{children}</code>;
    }
    return (
      <code className="rounded bg-noir-elevated px-1.5 py-0.5 font-mono text-[11px] text-neon/80" {...props}>
        {children}
      </code>
    );
  },
  // Headings
  h1: ({ children, ...props }: React.ComponentPropsWithoutRef<"h1">) => (
    <h1 className="mb-2 mt-3 font-display text-lg text-warm-100" {...props}>{children}</h1>
  ),
  h2: ({ children, ...props }: React.ComponentPropsWithoutRef<"h2">) => (
    <h2 className="mb-1.5 mt-2.5 font-display text-base text-warm-100" {...props}>{children}</h2>
  ),
  h3: ({ children, ...props }: React.ComponentPropsWithoutRef<"h3">) => (
    <h3 className="mb-1 mt-2 font-mono text-sm font-medium text-warm-200" {...props}>{children}</h3>
  ),
  // Paragraphs
  p: ({ children, ...props }: React.ComponentPropsWithoutRef<"p">) => (
    <p className="my-1 leading-relaxed" {...props}>{children}</p>
  ),
  // Bold & italic
  strong: ({ children, ...props }: React.ComponentPropsWithoutRef<"strong">) => (
    <strong className="font-semibold text-warm-100" {...props}>{children}</strong>
  ),
  em: ({ children, ...props }: React.ComponentPropsWithoutRef<"em">) => (
    <em className="text-warm-300" {...props}>{children}</em>
  ),
  // Lists
  ul: ({ children, ...props }: React.ComponentPropsWithoutRef<"ul">) => (
    <ul className="my-1.5 ml-4 list-disc space-y-0.5 text-warm-200" {...props}>{children}</ul>
  ),
  ol: ({ children, ...props }: React.ComponentPropsWithoutRef<"ol">) => (
    <ol className="my-1.5 ml-4 list-decimal space-y-0.5 text-warm-200" {...props}>{children}</ol>
  ),
  li: ({ children, ...props }: React.ComponentPropsWithoutRef<"li">) => (
    <li className="leading-relaxed" {...props}>{children}</li>
  ),
  // Links
  a: ({ children, href, ...props }: React.ComponentPropsWithoutRef<"a">) => (
    <a href={href} target="_blank" rel="noopener noreferrer" className="text-neon/80 underline decoration-neon/30 hover:text-neon" {...props}>
      {children}
    </a>
  ),
  // Blockquotes
  blockquote: ({ children, ...props }: React.ComponentPropsWithoutRef<"blockquote">) => (
    <blockquote className="my-1.5 border-l-2 border-neon/20 pl-3 text-warm-400 italic" {...props}>
      {children}
    </blockquote>
  ),
  // Tables
  table: ({ children, ...props }: React.ComponentPropsWithoutRef<"table">) => (
    <div className="my-2 overflow-x-auto">
      <table className="w-full border-collapse font-mono text-[11px]" {...props}>{children}</table>
    </div>
  ),
  th: ({ children, ...props }: React.ComponentPropsWithoutRef<"th">) => (
    <th className="border border-noir-border bg-noir-elevated px-3 py-1.5 text-left text-warm-300" {...props}>{children}</th>
  ),
  td: ({ children, ...props }: React.ComponentPropsWithoutRef<"td">) => (
    <td className="border border-noir-border px-3 py-1.5 text-warm-400" {...props}>{children}</td>
  ),
  // Horizontal rule
  hr: (props: React.ComponentPropsWithoutRef<"hr">) => (
    <hr className="my-3 border-noir-border-light" {...props} />
  ),
};

/** Extraire le texte brut des children React (pour le copy button) */
function extractTextContent(children: React.ReactNode): string {
  if (typeof children === "string") return children;
  if (typeof children === "number") return String(children);
  if (Array.isArray(children)) return children.map(extractTextContent).join("");
  if (children && typeof children === "object" && "props" in children) {
    const el = children as { props?: { children?: React.ReactNode } };
    return extractTextContent(el.props?.children);
  }
  return "";
}

// ─── Collapsible Tool Call Group ────────────────────────

/** Regroupe les tool_use consécutifs en un bloc collapsible */
const ToolCallGroup = memo(function ToolCallGroup({
  messages,
  animate,
}: {
  messages: AgentMessage[];
  animate: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const toolNames = [...new Set(messages.filter((m) => m.toolName).map((m) => m.toolName!))];
  const callCount = messages.filter((m) => m.type === "tool_use").length;

  return (
    <motion.div
      initial={animate ? { opacity: 0, y: 4 } : false}
      animate={animate ? { opacity: 1, y: 0 } : undefined}
      transition={{ duration: 0.15 }}
      className="my-0.5"
    >
      {/* Header cliquable — résumé des tool calls */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="group flex w-full items-center gap-2 rounded-sm px-1.5 py-1 text-left transition-colors hover:bg-white/[0.02]"
      >
        <motion.div
          animate={{ rotate: expanded ? 90 : 0 }}
          transition={{ duration: 0.1 }}
          className="flex-shrink-0 text-status-completed/50"
        >
          <ChevronRight className="h-3 w-3" />
        </motion.div>
        <span className="font-mono text-[10px] text-status-completed/60">
          Called {toolNames.join(", ")} {callCount > 1 ? `(${callCount} calls)` : ""}
        </span>
      </button>

      {/* Détail — visible quand expanded */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="overflow-hidden border-l border-noir-border-light ml-3 pl-2"
          >
            {messages.map((msg) => {
              const toolCall = msg.type === "tool_use" ? parseToolCall(msg.content) : null;
              return (
                <div
                  key={msg.id}
                  className="flex items-start gap-3 px-1.5 py-[2px] font-mono text-[11px]"
                >
                  <span className="flex-shrink-0 text-[10px] tabular-nums text-warm-600/50">
                    {formatTime(msg.timestamp)}
                  </span>
                  <TypeTag type={msg.type} />
                  <span className="text-warm-700">│</span>
                  {toolCall ? (
                    <span className="min-w-0 break-words">
                      <span className="font-medium text-neon">{toolCall.toolName}</span>
                      <span className="text-warm-500">(</span>
                      <span className="text-warm-400">{toolCall.args}</span>
                      <span className="text-warm-500">)</span>
                    </span>
                  ) : (
                    <span className="min-w-0 break-words text-warm-400">{msg.content}</span>
                  )}
                </div>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
});

// ─── Grouper les messages pour les tool calls consécutifs ──

interface MessageGroup {
  type: "single" | "tools";
  messages: AgentMessage[];
}

/** Regroupe les tool_use et tool_result consécutifs ensemble */
function groupMessages(messages: AgentMessage[]): MessageGroup[] {
  const groups: MessageGroup[] = [];
  let toolBuffer: AgentMessage[] = [];

  const flushTools = () => {
    if (toolBuffer.length > 0) {
      groups.push({ type: "tools", messages: toolBuffer });
      toolBuffer = [];
    }
  };

  for (const msg of messages) {
    if (msg.type === "tool_use" || msg.type === "tool_result") {
      toolBuffer.push(msg);
    } else {
      flushTools();
      groups.push({ type: "single", messages: [msg] });
    }
  }
  flushTools();
  return groups;
}

// ─── Markdown message — memoized pour éviter re-parse ───

const MarkdownMessage = memo(function MarkdownMessage({ content }: { content: string }) {
  return (
    <div className="min-w-0 prose-noir">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
        {content}
      </ReactMarkdown>
    </div>
  );
});

// ─── Composant principal ────────────────────────────────

export function TerminalOutput({ messages, isLive }: TerminalOutputProps) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    requestAnimationFrame(() => {
      const container = scrollContainerRef.current;
      if (container) {
        container.scrollTop = container.scrollHeight;
      }
    });
  }, [messages.length]);

  const animationsEnabled = messages.length <= ANIMATION_THRESHOLD;
  const groups = groupMessages(messages);

  return (
    <div className="terminal-crt relative flex h-full flex-col overflow-hidden rounded-none border border-noir-border bg-black/80">
      {/* Barre de titre macOS-style */}
      <div className="flex items-center justify-between border-b border-noir-border/60 bg-noir-card/60 px-4 py-2">
        <div className="flex items-center gap-3">
          <div className="flex gap-1.5">
            <div className="h-2 w-2 rounded-full bg-[#ff5f57]" />
            <div className="h-2 w-2 rounded-full bg-[#febc2e]" />
            <div className="h-2 w-2 rounded-full bg-[#28c840]" />
          </div>
          <span className="font-mono text-[10px] tracking-wide text-warm-600">
            output
          </span>
        </div>

        {isLive && (
          <div className="flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-neon animate-pulse-neon shadow-[0_0_4px_#00ff8840]" />
            <span className="font-mono text-[9px] uppercase tracking-[0.2em] text-neon/60">
              live
            </span>
          </div>
        )}
      </div>

      {/* Corps du terminal */}
      <div ref={scrollContainerRef} className="custom-scrollbar relative flex-1 min-h-0 overflow-y-auto px-4 py-3">
        {messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-4">
            <span className="font-mono text-xs text-warm-600">
              awaiting output<span className="animate-cursor text-neon/50">_</span>
            </span>
            <div className="flex flex-col items-center gap-1.5 font-mono text-[9px] text-warm-700">
              <span><span className="text-warm-500">/</span> commands</span>
              <span><span className="text-warm-500">↑↓</span> history</span>
              <span><span className="text-warm-500">Tab</span> autocomplete</span>
              <span><span className="text-warm-500">Ctrl+C</span> stop agent</span>
            </div>
          </div>
        ) : (
          <>
            {groups.map((group, gi) => {
              // Tool call groups → collapsible
              if (group.type === "tools") {
                return (
                  <ToolCallGroup
                    key={group.messages[0].id}
                    messages={group.messages}
                    animate={animationsEnabled}
                  />
                );
              }

              // Single messages
              const msg = group.messages[0];
              const isInit = isInitMessage(msg);
              const isUser = isUserMessage(msg);
              const isAssistantText = msg.type === "text" && !isUser;

              return (
                <motion.div
                  key={msg.id}
                  initial={animationsEnabled ? { opacity: 0, y: 4 } : false}
                  animate={animationsEnabled ? { opacity: 1, y: 0 } : undefined}
                  transition={{ duration: 0.15 }}
                  className={cn(
                    "terminal-line group flex items-start gap-3 rounded-sm px-1.5 py-[3px]",
                    "transition-colors hover:bg-white/[0.02]",
                    msg.type === "error" && "bg-status-error/[0.03] border-l-2 border-status-error/30 pl-3",
                    isInit && "bg-neon/[0.02] border-l-2 border-neon/20 pl-3",
                    isUser && "bg-neon/[0.01]"
                  )}
                >
                  {/* Timestamp */}
                  <span className="flex-shrink-0 font-mono text-[10px] tabular-nums text-warm-600/50 group-hover:text-warm-600">
                    {formatTime(msg.timestamp)}
                  </span>

                  <TypeTag type={msg.type} />
                  <span className="mt-[2px] flex-shrink-0 text-warm-700">│</span>

                  {/* Contenu */}
                  {isUser ? (
                    <span className="min-w-0 whitespace-pre-wrap break-words">
                      <span className="font-bold text-neon">&gt; </span>
                      <span className="text-neon/80">{msg.content.slice(2)}</span>
                    </span>
                  ) : isAssistantText ? (
                    /* Réponses assistant → Markdown rendering */
                    <MarkdownMessage content={msg.content} />
                  ) : (
                    <span
                      className={cn(
                        "min-w-0 whitespace-pre-wrap break-words",
                        msg.type === "system" && "text-warm-500 italic",
                        msg.type === "error" && "text-status-error/80"
                      )}
                    >
                      {msg.content}
                    </span>
                  )}
                </motion.div>
              );
            })}
          </>
        )}

        {/* Curseur vert clignotant */}
        {isLive && messages.length > 0 && (
          <div className="mt-1 pl-1 font-mono text-sm">
            <span className="animate-cursor text-neon">_</span>
          </div>
        )}

        <div ref={bottomRef} />
      </div>
    </div>
  );
}
