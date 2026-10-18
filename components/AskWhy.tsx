import { useState, type FormEvent } from "react";
import type { Guard } from "@/lib/tutor";
import styles from "./flow.module.css";

type Message = { role: "user" | "assistant"; content: string; guard?: Guard };

type Props = {
  taskId: string;
  code: string;
  onAsk: () => void; // asking counts as help, so this step can't count as mastered
};

export const GUARD_NOTES: Partial<Record<Guard, string>> = {
  regenerated: "🛡 The output filter blocked a draft that gave away code and asked again.",
  fallback: "🛡 The output filter blocked two drafts, so this is a pre-written reply.",
};

// "Why?" questions during a ladder step. Keyed by task, so it resets per step.
export default function AskWhy({ taskId, code, onAsk }: Props) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send(event: FormEvent) {
    event.preventDefault();
    const text = input.trim();
    if (!text || loading) return;
    onAsk();

    // The model remembers nothing, so we keep the history here and send all of it.
    const next: Message[] = [...messages, { role: "user", content: text }];
    setMessages(next);
    setInput("");
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "explain",
          taskId,
          code,
          messages: next.map(({ role, content }) => ({ role, content })),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Request failed.");
      setMessages([...next, { role: "assistant", content: data.reply, guard: data.guard }]);
    } catch (err) {
      // Drop the unanswered message so the history stays user/assistant pairs.
      setMessages(messages);
      setInput(text);
      setError(err instanceof Error ? err.message : "Request failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={styles.chat}>
      <div className={styles.chatLog}>
        {messages.length === 0 && (
          <p className={styles.dim}>
            Ask why something works, like “why min and not max?” Asking is fine,
            but then this step won&apos;t count as mastered.
          </p>
        )}
        {messages.map((m, i) => (
          <div key={i} className={styles[m.role]}>
            {m.content}
            {m.guard && GUARD_NOTES[m.guard] && (
              <div className={styles.guardNote}>{GUARD_NOTES[m.guard]}</div>
            )}
          </div>
        ))}
        {loading && <div className={styles.assistant}>Thinking…</div>}
      </div>
      {error && <p className={styles.error}>{error}</p>}
      <form onSubmit={send} className={styles.chatForm}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask why…"
          maxLength={1000}
        />
        <button type="submit" disabled={loading || !input.trim()}>
          Ask
        </button>
      </form>
    </div>
  );
}
