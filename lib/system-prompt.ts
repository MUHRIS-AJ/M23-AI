// Assembles the system prompt for a chat turn from layered sources:
//   1. App identity (M23)
//   2. Persona preset (lib/personas.ts) selected in Settings
//   3. The user's free-form personality text + preferred name + response style
//   4. Active skills (Skill.instructions) applied to this turn
//   5. Web/citation rules when web access is on
//
// Returns "" when nothing applies, so the caller can skip adding a system
// message entirely. The chat route prepends the result as a `system` message.

import { getPersonaPreset } from "@/lib/personas";

export const APP_NAME = "M23";

export interface ActiveSkill {
  name: string;
  instructions: string;
}

export interface BuildSystemPromptInput {
  preferredName?: string | null;
  personality?: string | null;
  personaPreset?: string | null;
  responseStyle?: string | null; // "concise" | "balanced" | "detailed"
  skills?: ActiveSkill[];
  webSearch?: boolean; // require inline citations + a Sources list
}

const RESPONSE_STYLE_RULES: Record<string, string> = {
  concise: "Keep responses short and to the point. Lead with the answer.",
  balanced: "Use a balanced level of detail — thorough but not padded.",
  detailed:
    "Be thorough and detailed. Cover edge cases, give examples, and explain your reasoning.",
};

export function buildSystemPrompt(input: BuildSystemPromptInput): string {
  const sections: string[] = [];

  // 1. Identity
  sections.push(
    `You are ${APP_NAME}, an AI assistant. Be accurate, helpful, and honest. ` +
      `If you are unsure, say so plainly, ask for the missing context, or use available tools instead of guessing.`
  );

  // 2. Persona preset
  const preset = getPersonaPreset(input.personaPreset);
  if (preset) {
    sections.push(preset.instructions);
  }

  // 3. User personalization
  if (input.preferredName?.trim()) {
    sections.push(`Address the user as "${input.preferredName.trim()}".`);
  }
  const style = input.responseStyle ? RESPONSE_STYLE_RULES[input.responseStyle] : null;
  if (style) sections.push(style);
  if (input.personality?.trim()) {
    sections.push(
      `The user has provided these custom instructions; follow them whenever they ` +
        `don't conflict with safety:\n${input.personality.trim()}`
    );
  }

  // 4. Active skills
  const skills = (input.skills ?? []).filter((s) => s.instructions?.trim());
  if (skills.length > 0) {
    const skillBlock = skills
      .map((s) => `### Skill: ${s.name}\n${s.instructions.trim()}`)
      .join("\n\n");
    sections.push(
      `The following skills are active for this conversation. Apply them:\n\n${skillBlock}`
    );
  }

  // 5. Web access + citation/proof rules
  if (input.webSearch) {
    sections.push(
      `You have live web access for this turn. When you use information from the web:\n` +
        `- Cite sources inline as [n] right after the claim they support.\n` +
        `- End with a "Sources" list mapping each [n] to its full URL.\n` +
        `- Prefer primary/authoritative sources, and note the date when facts may be time-sensitive.\n` +
        `- If sources conflict or you cannot verify a claim, say so explicitly rather than presenting it as fact.\n` +
        `- Use the read_url tool to fetch the full content of a specific link when you need to read or summarize it.\n` +
        `- When images are relevant (a product, a chart, a place), embed them inline using markdown ![description](https-image-url) ` +
        `with real image URLs you obtained from the page (the read_url tool returns an "images" list). Only embed http(s) image URLs you actually found — never invent one.`
    );
  }

  return sections.join("\n\n").trim();
}
