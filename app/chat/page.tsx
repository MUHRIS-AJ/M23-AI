"use client";

import * as React from "react";
import { useChat, type Message } from "@ai-sdk/react";
import { useSession, signOut } from "next-auth/react";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  Plus,
  Trash2,
  Menu,
  X,
  LogOut,
  Settings,
  MessageSquare,
  Loader2,
  Volume2,
  Square,
  AudioLines,
  Ghost,
  Telescope,
  SlidersHorizontal,
  Sparkles,
  Compass,
  TerminalSquare,
} from "lucide-react";
import {
  ClaudeChatInput,
  type ChatModel,
  type SendPayload,
  type SkillOption,
} from "@/components/ui/claude-style-chat-input";
import { ImageGeneration } from "@/components/ui/ai-chat-image-generation-1";
import { useSpeech, stripMarkdownForSpeech, type UseSpeech } from "@/lib/speech";
import { VoicePicker } from "@/components/ui/voice-picker";
import { M23Mark, M23Logo } from "@/components/ui/m23-logo";
import { ThemeToggle } from "@/components/theme-toggle";

interface ConversationSummary {
  id: string;
  title: string;
  updatedAt: string;
}

interface CapStatus {
  capUsd: number | null;
  spentUsd: number;
  remainingUsd: number | null;
  exceeded: boolean;
  period: string;
}

export default function ChatPage() {
  const { data: session } = useSession();
  const isAdmin = session?.user?.role === "ADMIN";

  const [models, setModels] = React.useState<ChatModel[]>([]);
  const [selectedModel, setSelectedModel] = React.useState<string>("");
  const [skills, setSkills] = React.useState<SkillOption[]>([]);
  const [defaultWebSearch, setDefaultWebSearch] = React.useState(false);
  const [imageSupported, setImageSupported] = React.useState(true);
  const [conversations, setConversations] = React.useState<ConversationSummary[]>([]);
  const [conversationId, setConversationId] = React.useState<string | undefined>();
  const [cap, setCap] = React.useState<CapStatus | null>(null);
  const [sidebarOpen, setSidebarOpen] = React.useState(false);
  const [banner, setBanner] = React.useState<string | null>(null);

  // Speech-to-text feeds dictated text into the composer via `injectedText`.
  const [injectedText, setInjectedText] = React.useState<string>("");
  const speech = useSpeech({ onTranscript: setInjectedText });

  // Prefill from the in-app browser ("Use in chat"): one-shot read of scraped
  // page content stashed in sessionStorage, dropped into the composer.
  React.useEffect(() => {
    const prefill = sessionStorage.getItem("m23.prefill");
    if (prefill) {
      sessionStorage.removeItem("m23.prefill");
      setInjectedText(prefill);
    }
  }, []);
  // Latest speech handle for use inside useChat callbacks (avoids stale closures).
  const speechRef = React.useRef(speech);
  speechRef.current = speech;

  // Temporary chat: nothing is persisted to the DB (usage is still recorded).
  const [temporary, setTemporary] = React.useState(false);
  const temporaryRef = React.useRef(false);
  temporaryRef.current = temporary;

  // Image generation overlay state (separate from the chat stream).
  const [imageGen, setImageGen] = React.useState<{
    state: "generating" | "completed";
    prompt: string;
    url?: string;
  } | null>(null);

  const conversationIdRef = React.useRef<string | undefined>(undefined);
  conversationIdRef.current = conversationId;
  const selectedModelRef = React.useRef<string>("");
  selectedModelRef.current = selectedModel;

  const { messages, append, setMessages, status, error, stop } = useChat({
    api: "/api/chat",
    onResponse(res) {
      const cid = res.headers.get("x-conversation-id");
      if (cid && cid !== conversationIdRef.current) {
        setConversationId(cid);
        refreshConversations();
      }
      if (!res.ok) {
        res
          .clone()
          .json()
          .then((j) => setBanner(j?.error ?? "Request failed"))
          .catch(() => setBanner("Request failed"));
      }
    },
    onFinish(message) {
      refreshUsage();
      // Read the reply aloud when the user has enabled auto-speak.
      const s = speechRef.current;
      if (s.autoSpeak) {
        const spoken = stripMarkdownForSpeech(message.content);
        if (spoken) void s.speak(spoken, message.id);
      }
    },
    onError(err) {
      setBanner(err.message || "Something went wrong");
    },
  });

  const isStreaming = status === "streaming" || status === "submitted";

  // ── data loading ──────────────────────────────────────────
  const refreshConversations = React.useCallback(async () => {
    const res = await fetch("/api/conversations");
    if (res.ok) {
      const json = await res.json();
      setConversations(json.conversations ?? []);
    }
  }, []);

  const refreshUsage = React.useCallback(async () => {
    const res = await fetch("/api/usage");
    if (res.ok) setCap(await res.json());
  }, []);

  React.useEffect(() => {
    (async () => {
      // Load models and the user's saved defaults together so we can preselect
      // the default model and seed the web-search toggle.
      const [mRes, sRes, iRes] = await Promise.all([
        fetch("/api/models"),
        fetch("/api/settings"),
        fetch("/api/image"),
      ]);
      let defaultModelId: string | null = null;
      if (sRes.ok) {
        const json = await sRes.json();
        defaultModelId = json.settings?.defaultModelId ?? null;
        setDefaultWebSearch(Boolean(json.settings?.alwaysWebSearch));
      }
      if (mRes.ok) {
        const json = await mRes.json();
        const list: ChatModel[] = json.models ?? [];
        setModels(list);
        // Prefer the saved default if it's still available, else first model.
        const preferred =
          defaultModelId && list.find((m) => m.id === defaultModelId)
            ? defaultModelId
            : list[0]?.id;
        if (preferred) setSelectedModel(preferred);
      }
      if (iRes.ok) {
        const json = await iRes.json();
        setImageSupported(Array.isArray(json.providers) && json.providers.length > 0);
      } else {
        setImageSupported(false);
      }
    })();
    (async () => {
      const res = await fetch("/api/skills");
      if (res.ok) {
        const json = await res.json();
        const list = (json.skills ?? []).filter(
          (s: { enabled: boolean }) => s.enabled
        );
        setSkills(
          list.map((s: { id: string; name: string; emoji: string; description: string; webAccess: boolean }) => ({
            id: s.id,
            name: s.name,
            emoji: s.emoji,
            description: s.description,
            webAccess: s.webAccess,
          }))
        );
      }
    })();
    refreshConversations();
    refreshUsage();
  }, [refreshConversations, refreshUsage]);

  // ── actions ───────────────────────────────────────────────
  async function handleSend(payload: SendPayload) {
    setBanner(null);
    const model = payload.model || selectedModelRef.current;

    // Image generation goes through its own (non-streaming) endpoint.
    if (payload.mode === "image") {
      const prompt = payload.message.trim();
      if (!prompt) return;
      // Optimistically show the user's prompt + the generating overlay.
      setMessages((prev) => [
        ...prev,
        { id: crypto.randomUUID(), role: "user", content: prompt },
      ]);
      setImageGen({ state: "generating", prompt });
      try {
        const res = await fetch("/api/image", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prompt, conversationId: conversationIdRef.current }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json?.error ?? "Image generation failed");

        const cid = res.headers.get("x-conversation-id");
        if (cid && cid !== conversationIdRef.current) {
          setConversationId(cid);
          refreshConversations();
        }
        setMessages((prev) => [
          ...prev,
          { id: crypto.randomUUID(), role: "assistant", content: json.content },
        ]);
        setImageGen({ state: "completed", prompt, url: json.dataUri });
        refreshUsage();
        // Clear the standalone overlay shortly after the message lands.
        setTimeout(() => setImageGen(null), 1200);
      } catch (e) {
        setBanner((e as Error).message);
        setImageGen(null);
      }
      return;
    }

    // Normal chat (optionally with web search).
    if (!model) {
      setBanner("No model available. Ask your admin to allocate one.");
      return;
    }
    append(
      { role: "user", content: payload.message },
      {
        body: {
          model,
          conversationId: temporaryRef.current ? undefined : conversationIdRef.current,
          webSearch: payload.isWebSearchEnabled,
          temporary: temporaryRef.current,
          skillIds: payload.skillIds,
        },
      }
    );
  }

  function newChat() {
    setConversationId(undefined);
    setMessages([]);
    setBanner(null);
    setSidebarOpen(false);
  }

  async function openConversation(id: string) {
    const res = await fetch(`/api/conversations/${id}`);
    if (!res.ok) return;
    const { conversation } = await res.json();
    setConversationId(id);
    setMessages(
      (conversation.messages as { id: string; role: string; content: string }[]).map(
        (m) => ({ id: m.id, role: m.role as Message["role"], content: m.content })
      )
    );
    if (conversation.model?.modelId) setSelectedModel(conversation.model.modelId);
    setSidebarOpen(false);
  }

  async function deleteConversation(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    await fetch(`/api/conversations/${id}`, { method: "DELETE" });
    if (id === conversationId) newChat();
    refreshConversations();
  }

  return (
    <div className="aura flex h-dvh overflow-hidden bg-background text-text-100">
      {/* ── Sidebar ──────────────────────────────────────────── */}
      <aside
        className={`glass glass-sheen fixed inset-y-0 left-0 z-40 flex w-72 flex-col transition-transform duration-300 md:static md:translate-x-0 ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between px-4 py-3.5">
          <M23Logo size={28} wordmarkClassName="text-sm" />
          <button
            onClick={() => setSidebarOpen(false)}
            className="md:hidden text-text-400 hover:text-text-200"
            aria-label="Close sidebar"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="px-3">
          <button
            onClick={newChat}
            className="flex w-full items-center gap-2 rounded-xl border border-bg-300 bg-background px-3 py-2.5 text-sm font-medium text-text-200 transition-colors hover:bg-bg-200"
          >
            <Plus className="h-4 w-4" />
            New chat
          </button>
        </div>

        <nav className="custom-scrollbar mt-3 flex-1 space-y-0.5 overflow-y-auto px-3 pb-3">
          {conversations.length === 0 && (
            <p className="px-2 py-4 text-xs text-text-400">No conversations yet.</p>
          )}
          {conversations.map((c) => (
            <button
              key={c.id}
              onClick={() => openConversation(c.id)}
              className={`group flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm transition-colors hover:bg-bg-200 ${
                c.id === conversationId ? "bg-bg-200 text-text-100" : "text-text-300"
              }`}
            >
              <MessageSquare className="h-3.5 w-3.5 shrink-0 opacity-60" />
              <span className="flex-1 truncate">{c.title}</span>
              <span
                onClick={(e) => deleteConversation(c.id, e)}
                className="opacity-0 transition-opacity group-hover:opacity-100"
                aria-label="Delete conversation"
              >
                <Trash2 className="h-3.5 w-3.5 text-text-400 hover:text-destructive" />
              </span>
            </button>
          ))}
        </nav>

        {/* footer */}
        <div className="border-t border-bg-300 p-3">
          {cap && cap.capUsd !== null && (
            <div className="mb-2 px-1">
              <div className="mb-1 flex justify-between text-[11px] text-text-400">
                <span>Budget ({cap.period.toLowerCase()})</span>
                <span>
                  ${cap.spentUsd.toFixed(3)} / ${cap.capUsd.toFixed(2)}
                </span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-bg-300">
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${Math.min(100, (cap.spentUsd / cap.capUsd) * 100)}%`,
                    background: cap.exceeded ? "var(--color-destructive)" : "var(--accent)",
                  }}
                />
              </div>
            </div>
          )}
          <div className="flex items-center justify-between gap-1">
            <div className="min-w-0 flex-1 px-1">
              <p className="truncate text-xs font-medium text-text-200">
                {session?.user?.name || session?.user?.email}
              </p>
              <p className="text-[10px] uppercase tracking-wide text-text-400">
                {session?.user?.role}
              </p>
            </div>
            {isAdmin && (
              <Link
                href="/admin"
                className="flex h-8 w-8 items-center justify-center rounded-lg text-text-400 transition-colors hover:bg-bg-200 hover:text-text-200"
                aria-label="Admin panel"
              >
                <Settings className="h-4 w-4" />
              </Link>
            )}
            <Link
              href="/settings"
              className="flex h-8 w-8 items-center justify-center rounded-lg text-text-400 transition-colors hover:bg-bg-200 hover:text-text-200"
              aria-label="Settings"
              title="Settings & personality"
            >
              <SlidersHorizontal className="h-4 w-4" />
            </Link>
            <ThemeToggle />
            <button
              onClick={() => signOut({ callbackUrl: "/login" })}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-text-400 transition-colors hover:bg-bg-200 hover:text-text-200"
              aria-label="Sign out"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* overlay for mobile */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/40 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* ── Main column ──────────────────────────────────────── */}
      <div className="flex flex-1 flex-col">
        {/* top bar */}
        <header className="glass sticky top-0 z-20 flex items-center gap-3 px-4 py-3">
          <button
            onClick={() => setSidebarOpen(true)}
            className="md:hidden text-text-400 hover:text-text-200"
            aria-label="Open sidebar"
          >
            <Menu className="h-5 w-5" />
          </button>
          <h1 className="truncate text-sm font-medium text-text-200">
            {temporary
              ? "Temporary chat"
              : conversations.find((c) => c.id === conversationId)?.title ?? "New chat"}
          </h1>
          <button
            onClick={() => {
              const next = !temporary;
              setTemporary(next);
              if (next) {
                // Entering temp mode: detach from the saved conversation.
                setConversationId(undefined);
                setMessages([]);
              }
              setBanner(null);
            }}
            className={`ml-auto flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors ${
              temporary
                ? "border-accent/40 bg-accent/10 text-accent"
                : "border-bg-300 text-text-300 hover:bg-bg-200 hover:text-text-100"
            }`}
            aria-pressed={temporary}
            aria-label="Temporary chat"
            title="Temporary chat — nothing is saved"
          >
            <Ghost className="h-4 w-4" />
            <span className="hidden sm:inline">Temporary</span>
          </button>
          <Link
            href="/research"
            className="flex items-center gap-1.5 rounded-lg border border-bg-300 px-2.5 py-1.5 text-xs font-medium text-text-300 transition-colors hover:bg-bg-200 hover:text-text-100"
            aria-label="Deep research"
          >
            <Telescope className="h-4 w-4" />
            <span className="hidden sm:inline">Research</span>
          </Link>
          <Link
            href="/skills"
            className="flex items-center gap-1.5 rounded-lg border border-bg-300 px-2.5 py-1.5 text-xs font-medium text-text-300 transition-colors hover:bg-bg-200 hover:text-text-100"
            aria-label="Skills"
          >
            <Sparkles className="h-4 w-4" />
            <span className="hidden sm:inline">Skills</span>
          </Link>
          <Link
            href="/browser"
            className="flex items-center gap-1.5 rounded-lg border border-bg-300 px-2.5 py-1.5 text-xs font-medium text-text-300 transition-colors hover:bg-bg-200 hover:text-text-100"
            aria-label="Browser"
          >
            <Compass className="h-4 w-4" />
            <span className="hidden sm:inline">Browser</span>
          </Link>
          <Link
            href="/voice"
            className="flex items-center gap-1.5 rounded-lg border border-bg-300 px-2.5 py-1.5 text-xs font-medium text-text-300 transition-colors hover:bg-bg-200 hover:text-text-100"
            aria-label="Voice mode"
          >
            <AudioLines className="h-4 w-4" />
            <span className="hidden sm:inline">Voice</span>
          </Link>
          <Link
            href="/cli"
            className="flex items-center gap-1.5 rounded-lg border border-bg-300 px-2.5 py-1.5 text-xs font-medium text-text-300 transition-colors hover:bg-bg-200 hover:text-text-100"
            aria-label="CLI panel"
          >
            <TerminalSquare className="h-4 w-4" />
            <span className="hidden sm:inline">CLI</span>
          </Link>
          <VoicePicker speech={speech} showAutoSpeak />
        </header>

        {/* messages */}
        <div className="custom-scrollbar flex-1 overflow-y-auto">
          {messages.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center px-4 text-center">
              <M23Mark size={56} className="mb-4 drop-shadow-lg" />
              <h2 className="font-serif text-2xl font-light text-text-200">
                How can I help you{session?.user?.name ? `, ${session.user.name.split(" ")[0]}` : ""}?
              </h2>
              <p className="mt-2 max-w-md text-sm text-text-400">
                {models.length === 0
                  ? "No models are allocated to your account yet. Contact your admin."
                  : "Pick a model below and start chatting."}
              </p>
            </div>
          ) : (
            <div className="mx-auto max-w-3xl px-4 py-6">
              {messages.map((m) => (
                <MessageBubble key={m.id} id={m.id} role={m.role} content={m.content} speech={speech} />
              ))}
              {imageGen && (
                <div className="mb-5 flex justify-start">
                  <ImageGeneration state={imageGen.state} duration={30000}>
                    {imageGen.url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={imageGen.url}
                        alt={imageGen.prompt}
                        className="aspect-square w-full max-w-md object-cover"
                      />
                    ) : (
                      <div className="flex aspect-square w-full max-w-md items-center justify-center bg-bg-200 text-text-400">
                        <span className="px-6 text-center text-sm">{imageGen.prompt}</span>
                      </div>
                    )}
                  </ImageGeneration>
                </div>
              )}
              {isStreaming && messages[messages.length - 1]?.role === "user" && (
                <div className="flex items-center gap-2 px-1 py-3 text-text-400">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span className="text-sm">Thinking…</span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* composer */}
        <div className="px-2 py-4 md:px-4">
          {banner && (
            <div className="mx-auto mb-3 max-w-2xl rounded-lg bg-destructive/10 px-3 py-2 text-center text-xs text-destructive">
              {banner}
            </div>
          )}
          <ClaudeChatInput
            models={models}
            selectedModel={selectedModel}
            onModelChange={setSelectedModel}
            onSendMessage={handleSend}
            disabled={isStreaming}
            skills={skills}
            defaultWebSearch={defaultWebSearch}
            imageSupported={imageSupported}
            placeholder={
              models.length === 0
                ? "Toggle the image button to generate, or ask your admin for a model…"
                : "How can I help you today?"
            }
            onToggleMic={() =>
              speech.listening ? speech.stopListening() : speech.startListening()
            }
            listening={speech.listening}
            sttSupported={speech.sttSupported}
            injectedText={injectedText}
            onStop={stop}
            isStreaming={isStreaming}
          />
        </div>
      </div>
    </div>
  );
}

// ── message bubble ──────────────────────────────────────────
function MessageBubble({
  id,
  role,
  content,
  speech,
}: {
  id: string;
  role: string;
  content: string;
  speech: UseSpeech;
}) {
  const isUser = role === "user";
  const isPlaying = speech.speaking && speech.speakingId === id;
  // Only offer playback for assistant text that isn't purely an image embed.
  const speakable = stripMarkdownForSpeech(content);
  const showTts = !isUser && speech.ttsSupported && speakable.length > 0;

  return (
    <div className={`group mb-5 flex flex-col ${isUser ? "items-end" : "items-start"}`}>
      <div
        className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-[15px] leading-relaxed ${
          isUser ? "bg-accent text-bg-0" : "bg-bg-200 text-text-100"
        }`}
      >
        {isUser ? (
          <span className="whitespace-pre-wrap">{content}</span>
        ) : (
          <div className="markdown-body">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
                img: (props) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    {...props}
                    className="my-2 max-w-full rounded-xl border border-bg-300"
                    alt={props.alt ?? "generated image"}
                  />
                ),
                p: (props) => <p className="mb-2 whitespace-pre-wrap last:mb-0" {...props} />,
                a: (props) => (
                  <a
                    {...props}
                    target="_blank"
                    rel="noreferrer"
                    className="text-accent underline underline-offset-2"
                  />
                ),
                code: (props) => (
                  <code
                    className="rounded bg-bg-300/60 px-1 py-0.5 font-mono text-[13px]"
                    {...props}
                  />
                ),
                ul: (props) => <ul className="mb-2 list-disc pl-5" {...props} />,
                ol: (props) => <ol className="mb-2 list-decimal pl-5" {...props} />,
              }}
            >
              {content}
            </ReactMarkdown>
          </div>
        )}
      </div>

      {showTts && (
        <button
          onClick={() => speech.speak(speakable, id)}
          className={`mt-1 inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs transition-colors ${
            isPlaying
              ? "text-accent"
              : "text-text-400 opacity-0 hover:text-text-200 group-hover:opacity-100"
          }`}
          aria-label={isPlaying ? "Stop playback" : "Read aloud"}
          type="button"
        >
          {isPlaying ? <Square className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />}
          {isPlaying ? "Stop" : "Listen"}
        </button>
      )}
    </div>
  );
}
