// Native chat tools the model can call mid-conversation. Currently a single
// `read_url` tool that fetches a page through the SSRF-safe extractor so the
// assistant can read a specific link the user pasted (or one it found via web
// search) and quote/cite it. Merged alongside MCP tools in the chat route.
import { tool } from "ai";
import { z } from "zod";
import { fetchAndExtract, WebFetchError } from "@/lib/web-fetch";

export function getWebTools() {
  return {
    read_url: tool({
      description:
        "Fetch and read the contents of a public web page by URL. Returns the page " +
        "title and readable text (truncated for long pages). Use this when the user " +
        "shares a link, asks you to read/summarize a page, or when you need the actual " +
        "content of a source you are about to cite. Always cite the URL you read.",
      parameters: z.object({
        url: z
          .string()
          .describe("The absolute http(s) URL to fetch, e.g. https://example.com/article"),
      }),
      execute: async ({ url }) => {
        try {
          const page = await fetchAndExtract(url);
          return {
            ok: true,
            url: page.url,
            title: page.title,
            text: page.text.slice(0, 12000),
            truncated: page.truncated,
            // Surface real image URLs (not just a count) so the model can embed
            // relevant ones inline with markdown ![](url).
            images: page.images.slice(0, 12),
            linkCount: page.links.length,
          };
        } catch (err) {
          const message =
            err instanceof WebFetchError ? err.message : (err as Error).message;
          return { ok: false, url, error: message };
        }
      },
    }),
  };
}
