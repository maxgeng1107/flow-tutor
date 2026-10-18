import Anthropic from "@anthropic-ai/sdk";

// Cheap, fast model. Override with ANTHROPIC_MODEL in .env.local if you want another.
const MODEL = process.env.ANTHROPIC_MODEL ?? "claude-haiku-5-5";
const MAX_MESSAGES = 30;
const MAX_CHARS = 4000;

type ChatRequest = { messages: Anthropic.MessageParam[] };

// This endpoint is public, so reject anything that isn't a short, well-formed
// chat. Otherwise anyone could use it to run big prompts on our API key.
function isValidChat(body: unknown): body is ChatRequest {
  if (typeof body !== "object" || body === null) return false;
  const { messages } = body as { messages?: unknown };
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
    // The API is stateless: we resend the whole conversation every time.
    const response = await client.messages.create({
      model: MODEL,
      // Haiku 5.5 always thinks first, and thinking tokens count toward this
      // limit, so leave headroom or replies get cut off.
      max_tokens: 4000,
      output_config: { effort: "medium" },
      system: "You are a helpful programming tutor for an intro Python course.",
      messages: body.messages,
    });

    if (response.stop_reason === "refusal") {
      return Response.json({ reply: "Sorry, I can't help with that one." });
    }

    const reply = response.content
      .filter((block) => block.type === "text")
      .map((block) => block.text)
      .join("");
    return Response.json({ reply });
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
