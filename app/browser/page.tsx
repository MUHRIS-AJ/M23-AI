"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Loader2,
  Search,
  Globe,
  ImageIcon,
  Link2,
  FileText,
  Copy,
  Check,
  MessageSquarePlus,
  ExternalLink,
} from "lucide-react";
import { M23Logo } from "@/components/ui/m23-logo";

interface Page {
  url: string;
  title: string;
  text: string;
  images: string[];
  links: { href: string; text: string }[];
  byteLength: number;
  truncated: boolean;
}

type Tab = "text" | "images" | "links";

export default function BrowserPage() {
  const router = useRouter();
  const [input, setInput] = React.useState("");
  const [page, setPage] = React.useState<Page | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [tab, setTab] = React.useState<Tab>("text");
  const [copied, setCopied] = React.useState(false);

  const fetchUrl = React.useCallback(async (raw: string) => {
    const url = raw.trim();
    if (!url) return;
    // Add a scheme if the user typed a bare domain.
    const normalized = /^https?:\/\//i.test(url) ? url : `https://${url}`;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/web/fetch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: normalized }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? "Failed to load page");
      setPage(json.page);
      setInput(json.page.url);
      setTab("text");
    } catch (e) {
      setError((e as Error).message);
      setPage(null);
    } finally {
      setLoading(false);
    }
  }, []);

  function copyText() {
    if (!page) return;
    navigator.clipboard.writeText(page.text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }

  // Push the scraped page into a new chat: stash it for the chat page to read.
  function sendToChat() {
    if (!page) return;
    const payload = `I scraped this page. Use it as context.\n\nURL: ${page.url}\nTitle: ${page.title}\n\n${page.text.slice(0, 12000)}`;
    sessionStorage.setItem("m23.prefill", payload);
    router.push("/chat");
  }

  return (
    <div className="aura min-h-dvh bg-background text-text-100">
      <header className="glass glass-sheen sticky top-0 z-20 flex items-center gap-3 px-4 py-3">
        <Link
          href="/chat"
          className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm text-text-300 transition-colors hover:bg-bg-200 hover:text-text-100"
        >
          <ArrowLeft className="h-4 w-4" />
          <span className="hidden sm:inline">Back</span>
        </Link>
        <M23Logo size={24} wordmarkClassName="text-sm" />
        <span className="text-sm font-medium text-text-300">· Browser</span>
      </header>

      <div className="mx-auto max-w-3xl px-4 py-6">
        {/* URL bar */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            fetchUrl(input);
          }}
          className="mb-5 flex items-center gap-2"
        >
          <div className="flex flex-1 items-center gap-2 rounded-xl border border-bg-300 bg-background px-3.5 py-2.5 focus-within:border-accent">
            <Globe className="h-4 w-4 shrink-0 text-text-400" />
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Enter a URL to read & scrape (e.g. en.wikipedia.org/wiki/AI)"
              className="w-full bg-transparent text-sm outline-none placeholder:text-text-400"
              autoFocus
            />
          </div>
          <button
            type="submit"
            disabled={loading || !input.trim()}
            className="flex items-center gap-1.5 rounded-xl bg-accent px-4 py-2.5 text-sm font-medium text-bg-0 transition-opacity hover:opacity-90 disabled:opacity-60"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            <span className="hidden sm:inline">Read</span>
          </button>
        </form>

        {error && (
          <div className="mb-4 rounded-xl bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        )}

        {!page && !loading && !error && (
          <div className="rounded-2xl border border-dashed border-bg-300 py-16 text-center">
            <Globe className="mx-auto mb-3 h-8 w-8 text-text-400" />
            <p className="text-sm text-text-400">
              Enter any URL to fetch and extract its content.
            </p>
            <p className="mx-auto mt-2 max-w-sm text-xs text-text-500">
              M23 reads the page server-side, pulls out the readable text, images, and
              links, and lets you push it all into a chat.
            </p>
          </div>
        )}

        {page && (
          <div className="animate-fade-in">
            {/* page header */}
            <div className="mb-4 rounded-2xl border border-bg-300 p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h1 className="truncate font-medium">{page.title}</h1>
                  <a
                    href={page.url}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-0.5 flex items-center gap-1 text-xs text-accent hover:underline"
                  >
                    <span className="truncate">{page.url}</span>
                    <ExternalLink className="h-3 w-3 shrink-0" />
                  </a>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  onClick={sendToChat}
                  className="flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-bg-0 transition-opacity hover:opacity-90"
                >
                  <MessageSquarePlus className="h-3.5 w-3.5" />
                  Use in chat
                </button>
                <button
                  onClick={copyText}
                  className="flex items-center gap-1.5 rounded-lg border border-bg-300 px-3 py-1.5 text-xs font-medium text-text-300 transition-colors hover:bg-bg-200"
                >
                  {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                  {copied ? "Copied" : "Copy text"}
                </button>
                <span className="ml-auto self-center text-[11px] text-text-500">
                  {(page.byteLength / 1024).toFixed(0)} KB
                  {page.truncated && " · truncated"}
                </span>
              </div>
            </div>

            {/* tabs */}
            <div className="mb-3 flex gap-1 border-b border-bg-300">
              <TabButton active={tab === "text"} onClick={() => setTab("text")} icon={<FileText className="h-3.5 w-3.5" />} label="Text" />
              <TabButton active={tab === "images"} onClick={() => setTab("images")} icon={<ImageIcon className="h-3.5 w-3.5" />} label={`Images (${page.images.length})`} />
              <TabButton active={tab === "links"} onClick={() => setTab("links")} icon={<Link2 className="h-3.5 w-3.5" />} label={`Links (${page.links.length})`} />
            </div>

            {/* tab content */}
            {tab === "text" && (
              <div className="custom-scrollbar max-h-[60dvh] overflow-y-auto whitespace-pre-wrap rounded-2xl border border-bg-300 p-4 text-sm leading-relaxed text-text-200">
                {page.text || <span className="text-text-400">No readable text found.</span>}
              </div>
            )}

            {tab === "images" && (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {page.images.length === 0 && (
                  <p className="col-span-full py-8 text-center text-sm text-text-400">No images found.</p>
                )}
                {page.images.map((src) => (
                  <a key={src} href={src} target="_blank" rel="noreferrer" className="group block overflow-hidden rounded-xl border border-bg-300">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={src}
                      alt=""
                      loading="lazy"
                      className="aspect-square w-full bg-bg-200 object-cover transition-transform group-hover:scale-105"
                      onError={(e) => { (e.currentTarget.parentElement as HTMLElement).style.display = "none"; }}
                    />
                  </a>
                ))}
              </div>
            )}

            {tab === "links" && (
              <div className="custom-scrollbar max-h-[60dvh] space-y-1 overflow-y-auto">
                {page.links.length === 0 && (
                  <p className="py-8 text-center text-sm text-text-400">No links found.</p>
                )}
                {page.links.map((l) => (
                  <button
                    key={l.href}
                    onClick={() => fetchUrl(l.href)}
                    className="flex w-full items-start gap-2 rounded-lg px-3 py-2 text-left transition-colors hover:bg-bg-200"
                  >
                    <Link2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-text-400" />
                    <span className="min-w-0">
                      <span className="block truncate text-sm text-text-200">{l.text || l.href}</span>
                      <span className="block truncate text-[11px] text-text-500">{l.href}</span>
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 border-b-2 px-3 py-2 text-xs font-medium transition-colors ${
        active
          ? "border-accent text-accent"
          : "border-transparent text-text-400 hover:text-text-200"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}
