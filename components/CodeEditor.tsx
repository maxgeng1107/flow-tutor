import { useLayoutEffect, useRef, type KeyboardEvent } from "react";
import styles from "./flow.module.css";

type Props = {
  value: string;
  onChange: (code: string) => void;
};

const INDENT = "    ";

// A plain textarea with the editor basics Python needs: Tab indents, Enter
// keeps the indentation (one level deeper after a colon), and Backspace at
// the start of an indented line removes a whole level.
export default function CodeEditor({ value, onChange }: Props) {
  const ref = useRef<HTMLTextAreaElement>(null);
  // Where the cursor should go after our own edit. Setting a controlled
  // textarea's value moves the cursor to the end, so put it back right after
  // React writes the new value.
  const pendingCaret = useRef<number | null>(null);

  useLayoutEffect(() => {
    if (pendingCaret.current === null || !ref.current) return;
    ref.current.setSelectionRange(pendingCaret.current, pendingCaret.current);
    pendingCaret.current = null;
  }, [value]);

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    const { selectionStart: start, selectionEnd: end } = event.currentTarget;
    const before = value.slice(0, start);
    const line = before.slice(before.lastIndexOf("\n") + 1);

    const replace = (insert: string, from = start) => {
      event.preventDefault();
      pendingCaret.current = from + insert.length;
      onChange(value.slice(0, from) + insert + value.slice(end));
    };

    if (event.key === "Tab" && !event.shiftKey) {
      replace(INDENT);
    } else if (event.key === "Enter" && !event.shiftKey && !event.metaKey && !event.ctrlKey) {
      const indent = line.match(/^ */)![0];
      const deeper = line.trimEnd().endsWith(":") ? INDENT : "";
      replace("\n" + indent + deeper);
    } else if (
      event.key === "Backspace" &&
      start === end &&
      line.length > 0 &&
      line.length % INDENT.length === 0 &&
      /^ +$/.test(line)
    ) {
      replace("", start - INDENT.length);
    }
  }

  return (
    <textarea
      ref={ref}
      className={styles.editor}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={onKeyDown}
      spellCheck={false}
      maxLength={4000}
      aria-label="Your code"
      rows={Math.max(8, value.split("\n").length + 1)}
    />
  );
}
