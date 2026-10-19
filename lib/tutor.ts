// Both guardrail layers wired together. Used by the API route and the eval script.

import Anthropic from "@anthropic-ai/sdk";
import { STEPS, type Task } from "./content";
import { buildSystemPrompt, RETRY_REMINDER, type Mode } from "./prompt";
import { fallbackReply, findLeak } from "./guard";

export const MODEL = process.env.ANTHROPIC_MODEL ?? "claude-haiku-5-5";

// "passed": the prompt alone kept the answer back (layer 1).
// "regenerated": the filter blocked a draft and the retry was clean (layer 2).
// "fallback": the retry leaked too, so we sent a hand-written reply (layer 2).
export type Guard = "passed" | "regenerated" | "fallback";

export type TutorResult = {
  reply: string;
  guard: Guard;
  // Every draft the model wrote, including blocked ones. For logs and evals
  // only: never send these to the browser.
  drafts: string[];
  leak: string | null;
};

// Lines the tutor must never write: the one hint may not give away any step's
// answer, and a step's chat may not give away that step's answer.
function forbiddenLines(mode: Mode, task: Task): string[] {
  if (mode === "hint") {
    return STEPS.flatMap((s) => [s.task.keyLine, s.twin.keyLine]).filter(
      (line): line is string => !!line,
    );
  }
  return task.keyLine ? [task.keyLine] : [];
}

async function draft(
  client: Anthropic,
  system: string,
  messages: Anthropic.MessageParam[],
): Promise<string> {
  // The API is stateless: we resend the whole conversation every time.
  const response = await client.messages.create({
    model: MODEL,
    // Haiku 5.5 always thinks first, and thinking tokens count toward this
    // limit, so leave headroom or replies get cut off.
    max_tokens: 4000,
    output_config: { effort: "medium" },
    system,
    messages,
  });
  if (response.stop_reason === "refusal") {
    return "Sorry, I can't help with that one. Let's get back to the problem.";
  }
  return response.content
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("");
}

export async function tutorReply(
  client: Anthropic,
  mode: Mode,
  task: Task,
  code: string,
  messages: Anthropic.MessageParam[],
): Promise<TutorResult> {
  const system = buildSystemPrompt(mode, task, code);
  const forbidden = forbiddenLines(mode, task);
  const earlierReplies = messages
    .filter((m) => m.role === "assistant")
    .map((m) => (typeof m.content === "string" ? m.content : ""));
  const check = (text: string) => findLeak(text, code, earlierReplies, forbidden);

  const first = await draft(client, system, messages);
  const leak = check(first);
  if (!leak) return { reply: first, guard: "passed", drafts: [first], leak };

  // Blocked. Regenerate once with a stronger reminder.
  const second = await draft(client, system + RETRY_REMINDER, messages);
  if (!check(second)) {
    return { reply: second, guard: "regenerated", drafts: [first, second], leak };
  }

  // Leaked twice. Fall back to a reply that can't leak.
  return { reply: fallbackReply(mode), guard: "fallback", drafts: [first, second], leak };
}
