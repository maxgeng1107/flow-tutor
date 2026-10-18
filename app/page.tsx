"use client";

import { useState, type FormEvent } from "react";
import { PROBLEM, STARTER_CODE } from "@/lib/problem";
import styles from "./page.module.css";

type ChatMessage = { role: "user" | "assistant"; content: string };

export default function Home() {
  const [code, setCode] = useState(STARTER_CODE);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
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
        body: JSON.stringify({ messages: next }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Request failed.");
      setMessages([...next, { role: "assistant", content: data.reply }]);
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
        />
      </section>

      <section className={styles.right}>
        <div className={styles.chat}>
          {messages.length === 0 && (
            <p className={styles.empty}>
              Stuck? Ask the tutor about your code.
            </p>
          )}
          {messages.map((m, i) => (
            <div key={i} className={styles[m.role]}>
              {m.content}
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
