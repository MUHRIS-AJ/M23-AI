import { requireUser, errorResponse } from "@/lib/guard";
import { resolveProviderKey } from "@/lib/provider-keys";

// Tells the client whether a cloud speech key is available, so it can decide
// between browser-native and cloud STT/TTS without making a trial request.
// Both currently share the same OpenAI-compatible key, but they're reported
// separately so the contract can diverge later.
export async function GET() {
  try {
    const user = await requireUser();
    const key = await resolveProviderKey(user.id, user.role, ["openai", "custom"]);
    const available = key !== null;
    return Response.json({ cloudStt: available, cloudTts: available });
  } catch (err) {
    return errorResponse(err);
  }
}
