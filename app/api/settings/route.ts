import { prisma } from "@/lib/prisma";
import { requireUser, errorResponse } from "@/lib/guard";
import { PERSONA_PRESETS } from "@/lib/personas";

// Returns the current user's personalization settings + the available persona
// presets (so the Settings UI can render the picker without a second call).
export async function GET() {
  try {
    const user = await requireUser();
    const profile = await prisma.user.findUnique({
      where: { id: user.id },
      select: {
        preferredName: true,
        personality: true,
        personaPreset: true,
        responseStyle: true,
        defaultModelId: true,
        alwaysWebSearch: true,
      },
    });
    return Response.json({
      settings: profile,
      presets: PERSONA_PRESETS.map((p) => ({
        id: p.id,
        name: p.name,
        emoji: p.emoji,
        description: p.description,
      })),
    });
  } catch (err) {
    return errorResponse(err);
  }
}

const VALID_STYLES = new Set(["concise", "balanced", "detailed"]);
const VALID_PRESETS = new Set([...PERSONA_PRESETS.map((p) => p.id), "custom"]);

// Update personalization. All fields optional; only provided keys are written.
export async function PUT(req: Request) {
  try {
    const user = await requireUser();
    const body = (await req.json()) as {
      preferredName?: string | null;
      personality?: string | null;
      personaPreset?: string | null;
      responseStyle?: string | null;
      defaultModelId?: string | null;
      alwaysWebSearch?: boolean;
    };

    const data: Record<string, unknown> = {};

    if ("preferredName" in body)
      data.preferredName = clampOrNull(body.preferredName, 80);
    if ("personality" in body)
      data.personality = clampOrNull(body.personality, 4000);
    if ("personaPreset" in body) {
      const v = body.personaPreset;
      data.personaPreset = v && VALID_PRESETS.has(v) ? v : null;
    }
    if ("responseStyle" in body) {
      const v = body.responseStyle;
      data.responseStyle = v && VALID_STYLES.has(v) ? v : null;
    }
    if ("defaultModelId" in body)
      data.defaultModelId = clampOrNull(body.defaultModelId, 120);
    if ("alwaysWebSearch" in body)
      data.alwaysWebSearch = Boolean(body.alwaysWebSearch);

    const updated = await prisma.user.update({
      where: { id: user.id },
      data,
      select: {
        preferredName: true,
        personality: true,
        personaPreset: true,
        responseStyle: true,
        defaultModelId: true,
        alwaysWebSearch: true,
      },
    });
    return Response.json({ settings: updated });
  } catch (err) {
    return errorResponse(err);
  }
}

function clampOrNull(v: string | null | undefined, max: number): string | null {
  if (v == null) return null;
  const t = String(v).trim();
  if (!t) return null;
  return t.slice(0, max);
}
