// SSRF-safe web fetching + HTML extraction.
//
// A server that fetches arbitrary user-supplied URLs is a classic SSRF vector:
// without guards a user could make the server hit localhost, RFC1918 ranges, or
// the cloud metadata endpoint (169.254.169.254). We defend by resolving the
// hostname first and refusing any private / loopback / link-local address, then
// fetching with a timeout and a hard size cap. We also strip credentials and
// only allow http/https.
//
// Extraction is dependency-free: a pragmatic regex/stack cleaner that pulls
// readable text, the <title>, and the first N image + link URLs. It is not a
// full DOM parser, but it is robust enough to feed an LLM and to power the
// in-app browser/scraper.

import dns from "node:dns/promises";
import net from "node:net";

export interface FetchedPage {
  url: string; // final URL (after our single fetch)
  title: string;
  text: string; // cleaned, readable text (truncated)
  images: string[]; // absolute image URLs
  links: { href: string; text: string }[]; // absolute links
  byteLength: number;
  truncated: boolean;
}

export class WebFetchError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message);
  }
}

const MAX_BYTES = 2_500_000; // 2.5 MB cap on downloaded HTML
const FETCH_TIMEOUT_MS = 12_000;
const MAX_TEXT_CHARS = 40_000; // cap text handed back to the caller / model
const MAX_LINKS = 60;
const MAX_IMAGES = 40;

/** True if an IP literal is in a private/loopback/link-local/reserved range. */
function isPrivateIp(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const p = ip.split(".").map(Number);
    if (p[0] === 10) return true; // 10.0.0.0/8
    if (p[0] === 127) return true; // loopback
    if (p[0] === 0) return true; // 0.0.0.0/8
    if (p[0] === 169 && p[1] === 254) return true; // link-local + metadata
    if (p[0] === 172 && p[1] >= 16 && p[1] <= 31) return true; // 172.16/12
    if (p[0] === 192 && p[1] === 168) return true; // 192.168/16
    if (p[0] === 100 && p[1] >= 64 && p[1] <= 127) return true; // CGNAT 100.64/10
    if (p[0] >= 224) return true; // multicast / reserved
    return false;
  }
  if (net.isIPv6(ip)) {
    const low = ip.toLowerCase();
    if (low === "::1" || low === "::") return true; // loopback / unspecified
    if (low.startsWith("fe80")) return true; // link-local
    if (low.startsWith("fc") || low.startsWith("fd")) return true; // unique local
    // IPv4-mapped (::ffff:a.b.c.d) — re-check the embedded v4.
    const mapped = low.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isPrivateIp(mapped[1]);
    return false;
  }
  return true; // unknown form → treat as unsafe
}

/** Validate a user URL and ensure it does not resolve to a private address. */
async function assertSafeUrl(raw: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new WebFetchError(400, "Invalid URL");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new WebFetchError(400, "Only http and https URLs are allowed");
  }
  if (url.username || url.password) {
    throw new WebFetchError(400, "URLs with embedded credentials are not allowed");
  }
  const host = url.hostname;
  // Block obvious literals up front.
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".internal")) {
    throw new WebFetchError(403, "Blocked host");
  }
  // If the host is an IP literal, check it directly; otherwise resolve it.
  if (net.isIP(host)) {
    if (isPrivateIp(host)) throw new WebFetchError(403, "Blocked private address");
  } else {
    let addrs: { address: string }[];
    try {
      addrs = await dns.lookup(host, { all: true });
    } catch {
      throw new WebFetchError(400, "Could not resolve host");
    }
    if (addrs.length === 0 || addrs.some((a) => isPrivateIp(a.address))) {
      throw new WebFetchError(403, "Host resolves to a blocked address");
    }
  }
  return url;
}

/** Download a URL's HTML/text with SSRF guards, a timeout, and a size cap. */
export async function safeFetch(raw: string): Promise<{ url: URL; body: string; bytes: number; truncated: boolean; contentType: string }> {
  const url = await assertSafeUrl(raw);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url.toString(), {
      signal: controller.signal,
      redirect: "follow",
      headers: {
        // Identify politely; some sites 403 a missing UA.
        "User-Agent": "M23-Bot/1.0 (+https://m23.app)",
        Accept: "text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.5",
      },
    });
    if (!res.ok) {
      throw new WebFetchError(res.status, `Upstream returned ${res.status}`);
    }
    const contentType = res.headers.get("content-type") ?? "";
    // Read with a hard byte cap so a huge page can't exhaust memory.
    const reader = res.body?.getReader();
    if (!reader) {
      const text = await res.text();
      return { url, body: text.slice(0, MAX_BYTES), bytes: text.length, truncated: text.length > MAX_BYTES, contentType };
    }
    const chunks: Uint8Array[] = [];
    let received = 0;
    let truncated = false;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        received += value.length;
        if (received > MAX_BYTES) {
          chunks.push(value.slice(0, value.length - (received - MAX_BYTES)));
          truncated = true;
          await reader.cancel();
          break;
        }
        chunks.push(value);
      }
    }
    const merged = new Uint8Array(received > MAX_BYTES ? MAX_BYTES : received);
    let offset = 0;
    for (const c of chunks) {
      merged.set(c, offset);
      offset += c.length;
    }
    const body = new TextDecoder("utf-8", { fatal: false }).decode(merged);
    return { url, body, bytes: received, truncated, contentType };
  } catch (err) {
    if (err instanceof WebFetchError) throw err;
    if ((err as Error).name === "AbortError") {
      throw new WebFetchError(504, "Upstream timed out");
    }
    throw new WebFetchError(502, `Fetch failed: ${(err as Error).message}`);
  } finally {
    clearTimeout(timer);
  }
}

/** Resolve a possibly-relative URL against a base; return "" if invalid. */
function absolutize(href: string, base: URL): string {
  try {
    return new URL(href, base).toString();
  } catch {
    return "";
  }
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}

/** Strip an HTML document down to readable text + collect links and images. */
export function extractFromHtml(html: string, base: URL): Omit<FetchedPage, "url" | "byteLength" | "truncated"> {
  // Title
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = titleMatch ? decodeEntities(titleMatch[1]).trim().slice(0, 300) : base.hostname;

  // Images (src + data-src), absolutized + de-duped.
  const images: string[] = [];
  const seenImg = new Set<string>();
  const imgRe = /<img\b[^>]*?\b(?:data-src|src)\s*=\s*["']([^"']+)["'][^>]*>/gi;
  let m: RegExpExecArray | null;
  while ((m = imgRe.exec(html)) && images.length < MAX_IMAGES) {
    const abs = absolutize(m[1].trim(), base);
    if (abs && /^https?:/i.test(abs) && !seenImg.has(abs)) {
      seenImg.add(abs);
      images.push(abs);
    }
  }

  // Links (href + visible text).
  const links: { href: string; text: string }[] = [];
  const seenHref = new Set<string>();
  const aRe = /<a\b[^>]*?\bhref\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  while ((m = aRe.exec(html)) && links.length < MAX_LINKS) {
    const abs = absolutize(m[1].trim(), base);
    if (!abs || !/^https?:/i.test(abs) || seenHref.has(abs)) continue;
    const text = decodeEntities(m[2].replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
    seenHref.add(abs);
    links.push({ href: abs, text: text.slice(0, 160) });
  }

  // Readable text: drop non-content elements, then strip tags.
  const text = decodeEntities(
    html
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
      .replace(/<(svg|nav|footer|header|aside|form)[\s\S]*?<\/\1>/gi, " ")
      .replace(/<\/(p|div|li|h[1-6]|tr|br|section|article)>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
  )
    .replace(/[ \t\f\v]+/g, " ")
    .replace(/\n\s*\n\s*\n+/g, "\n\n")
    .replace(/^\s+|\s+$/gm, "")
    .trim()
    .slice(0, MAX_TEXT_CHARS);

  return { title, text, images, links };
}

/** High-level: fetch a URL safely and return an extracted page. */
export async function fetchAndExtract(raw: string): Promise<FetchedPage> {
  const { url, body, bytes, truncated, contentType } = await safeFetch(raw);

  // Non-HTML (e.g. text/plain, JSON) → return as-is text, no link/image parse.
  if (contentType && !/html|xml/i.test(contentType) && !body.includes("<")) {
    return {
      url: url.toString(),
      title: url.hostname,
      text: body.slice(0, MAX_TEXT_CHARS),
      images: [],
      links: [],
      byteLength: bytes,
      truncated,
    };
  }

  const extracted = extractFromHtml(body, url);
  return {
    url: url.toString(),
    ...extracted,
    byteLength: bytes,
    truncated: truncated || extracted.text.length >= MAX_TEXT_CHARS,
  };
}
