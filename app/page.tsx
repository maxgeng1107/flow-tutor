"use client";

import { useState, type FormEvent } from "react";
import { PROBLEM, STARTER_CODE } from "@/lib/problem";
import type { HintLevel } from "@/lib/prompt";
import type { Guard } from "@/lib/tutor";
import styles from "./page.module.css";

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
  guard?: Guard; // UI only; not sent back to the server
};

const LEVEL_NAMES: Record<HintLevel, string> = {
  1: "guiding question",
  2: "point to the bug",
  3: "plan in words",
};

const GUARD_NOTES: Partial<Record<Guard, string>> = {
  regenerated: "Output filter blocked a draft with too much code and asked again.",
  fallback: "Output filter blocked two drafts, so this is a pre-written hint.",
};

export default function Home() {
  const [code, setCode] = useState(STARTER_CODE);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [hintLevel, setHintLevel] = useState<HintLevel>(1);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send(event: FormEvent) {
    event.preventDefault();
    const text = input.trim();
    if (!text || loading) return;

    // The model remembers nothing, so we keep the history here and send all of it.
    const next: ChatMessage[] = [...messages, { role: "user", content: text }];
    setMessages(next);
    setInput("");
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: next.map(({ role, content }) => ({ role, content })),
          code,
          hintLevel,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Request failed.");
      setMessages([
        ...next,
        { role: "assistant", content: data.reply, guard: data.guard },
      ]);
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
    <main className={styles.main}>
      <section className={styles.left}>
        <h1>Hint-only Python tutor</h1>
        <pre className={styles.problem}>{PROBLEM}</pre>
        <label htmlFor="code">Your code</label>
        <textarea
          id="code"
          className={styles.code}
          value={code}
          onChange={(e) => setCode(e.target.value)}
          spellCheck={false}
          maxLength={4000}
        />
      </section>

      <section className={styles.right}>
        <div className={styles.levelBar}>
          <span>
            Hint level {hintLevel}/3: {LEVEL_NAMES[hintLevel]}
          </span>
          <button
            type="button"
            onClick={() => setHintLevel((l) => Math.min(l + 1, 3) as HintLevel)}
            disabled={hintLevel === 3}
          >
            Bigger hint
          </button>
        </div>
        <div className={styles.chat}>
          {messages.length === 0 && (
            <p className={styles.empty}>
              Stuck? Ask the tutor about your code. It gives hints, never the
              answer.
            </p>
          )}
          {messages.map((m, i) => (
            <div key={i} className={styles[m.role]}>
              {m.content}
              {m.guard && GUARD_NOTES[m.guard] && (
                <div className={styles.guard}>🛡 {GUARD_NOTES[m.guard]}</div>
              )}
            </div>
          ))}
          {loading && <div className={styles.assistant}>Thinking…</div>}
        </div>
        {error && <p className={styles.error}>{error}</p>}
        <form onSubmit={send} className={styles.form}>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask for a hint…"
            maxLength={4000}
          />
          <button type="submit" disabled={loading || !input.trim()}>
            Send
          </button>
        </form>
      </section>
    </main>
  );
}
