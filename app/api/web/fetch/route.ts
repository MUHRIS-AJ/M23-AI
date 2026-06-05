import { requireUser, errorResponse, AuthError } from "@/lib/guard";
import { fetchAndExtract, WebFetchError } from "@/lib/web-fetch";

export const maxDuration = 30;

// Fetch a single URL server-side (SSRF-guarded) and return extracted text,
// title, images, and links. Powers the in-app browser/scraper and the chat
// "read this link" flow. Auth-gated so it can't be used as an open proxy.
export async function POST(req: Request) {
  try {
    await requireUser();
    const body = (await req.json()) as { url?: string };
    const url = (body.url ?? "").trim();
    if (!url) throw new AuthError(400, "No URL provided");

    const page = await fetchAndExtract(url);
    return Response.json({ page });
  } catch (err) {
    if (err instanceof WebFetchError) {
      return Response.json({ error: err.message }, { status: err.status });
    }
    return errorResponse(err);
  }
}
