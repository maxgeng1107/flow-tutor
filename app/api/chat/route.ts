import Anthropic from "@anthropic-ai/sdk";
import { ORIGINAL, STEPS, taskById } from "@/lib/content";
import type { Mode } from "@/lib/prompt";
import { tutorReply } from "@/lib/tutor";

const MAX_MESSAGES = 20;
const MAX_CHARS = 4000;

// Only ladder steps and their twins have a "why?" chat.
const EXPLAIN_TASKS = new Set(STEPS.flatMap((s) => [s.task.id, s.twin.id]));

type ChatRequest = {
  mode: Mode;
  taskId: string;
  code: string;
  messages: Anthropic.MessageParam[];
};

// This endpoint is public, so reject anything that isn't a short, well-formed
// request. Otherwise anyone could use it to run big prompts on our API key.
function isValidRequest(body: unknown): body is ChatRequest {
  if (typeof body !== "object" || body === null) return false;
  const { mode, taskId, code, messages } = body as Record<string, unknown>;
  if (typeof code !== "string" || code.length > MAX_CHARS) return false;
  if (mode === "hint" && taskId !== ORIGINAL.id) return false;
  if (mode === "explain" && !EXPLAIN_TASKS.has(taskId as string)) return false;
  if (mode !== "hint" && mode !== "explain") return false;
  if (!Array.isArray(messages) || messages.length > MAX_MESSAGES) return false;
  return messages.every(
    (m) =>
      (m?.role === "user" || m?.role === "assistant") &&
      typeof m.content === "string" &&
      m.content.length <= MAX_CHARS,
  );
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  if (!isValidRequest(body)) {
    return Response.json({ error: "Invalid request." }, { status: 400 });
  }
  // The problem text comes from our own content, never from the browser.
  const task = taskById(body.taskId)!;
  const messages: Anthropic.MessageParam[] =
    body.mode === "hint"
      ? [{ role: "user", content: "I'm stuck. Give me one hint." }]
      : body.messages;
  if (messages.length === 0 || messages.at(-1)?.role !== "user") {
    return Response.json({ error: "Invalid request." }, { status: 400 });
  }

  // Runs only on the server, so the key never reaches the browser.
  if (!process.env.ANTHROPIC_API_KEY) {
    return Response.json(
      { error: "Server is missing ANTHROPIC_API_KEY." },
      { status: 500 },
    );
  }
  const client = new Anthropic(); // reads ANTHROPIC_API_KEY from process.env

  try {
    const result = await tutorReply(client, body.mode, task, body.code, messages);
    if (result.leak) console.log(`[guard] ${result.guard}: ${result.leak}`);
    // Only the final reply goes to the browser, never the blocked drafts.
    return Response.json({ reply: result.reply, guard: result.guard });
  } catch (error) {
    // Full details go to the server log only; the browser gets a short message.
    console.error(error);
    if (error instanceof Anthropic.AuthenticationError) {
      return Response.json({ error: "Server API key is invalid." }, { status: 500 });
    }
    if (error instanceof Anthropic.RateLimitError) {
      return Response.json(
        { error: "Too many requests. Try again in a minute." },
        { status: 429 },
      );
    }
    if (error instanceof Anthropic.APIError) {
      return Response.json(
        { error: `Model API error (${error.status}).` },
        { status: 502 },
      );
    }
    return Response.json({ error: "Server error." }, { status: 500 });
  }
}
