import Anthropic from "@anthropic-ai/sdk";
import type { HintLevel } from "@/lib/prompt";
import { tutorReply } from "@/lib/tutor";

const MAX_MESSAGES = 30;
const MAX_CHARS = 4000;

type ChatRequest = {
  messages: Anthropic.MessageParam[];
  code: string;
  // Lives in the browser, so a user could tamper with it. Fine for a demo
  // (the filter still applies at every level); in production, track it server-side.
  hintLevel: HintLevel;
};

// This endpoint is public, so reject anything that isn't a short, well-formed
// chat. Otherwise anyone could use it to run big prompts on our API key.
function isValidChat(body: unknown): body is ChatRequest {
  if (typeof body !== "object" || body === null) return false;
  const { messages, code, hintLevel } = body as Record<string, unknown>;
  if (typeof code !== "string" || code.length > MAX_CHARS) return false;
  if (hintLevel !== 1 && hintLevel !== 2 && hintLevel !== 3) return false;
  if (!Array.isArray(messages) || messages.length === 0) return false;
  if (messages.length > MAX_MESSAGES) return false;
  return messages.every(
    (m) =>
      (m?.role === "user" || m?.role === "assistant") &&
      typeof m.content === "string" &&
      m.content.length <= MAX_CHARS,
  );
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  if (!isValidChat(body)) {
    return Response.json({ error: "Invalid chat request." }, { status: 400 });
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
    const result = await tutorReply(
      client,
      body.messages,
      body.code,
      body.hintLevel,
    );
    if (result.leak) console.log(`[filter] ${result.guard}: ${result.leak}`);
    // Only the final reply goes to the browser, never the blocked drafts.
    return Response.json({ reply: result.reply, guard: result.guard });
  } catch (error) {
    // Full details go to the server log only; the browser gets a short message.
    console.error(error);
    if (error instanceof Anthropic.AuthenticationError) {
      return Response.json(
        { error: "Server API key is invalid." },
        { status: 500 },
      );
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
