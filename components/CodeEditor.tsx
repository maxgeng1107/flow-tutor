import type { KeyboardEvent } from "react";
import styles from "./flow.module.css";

type Props = {
  value: string;
  onChange: (code: string) => void;
  readOnly?: boolean;
};

// A plain textarea, plus Tab inserting 4 spaces, since Python needs indentation.
export default function CodeEditor({ value, onChange, readOnly }: Props) {
  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== "Tab" || event.shiftKey || readOnly) return;
    event.preventDefault();
    const el = event.currentTarget;
    const { selectionStart: start, selectionEnd: end } = el;
    onChange(value.slice(0, start) + "    " + value.slice(end));
    requestAnimationFrame(() => el.setSelectionRange(start + 4, start + 4));
  }

  return (
    <textarea
      className={styles.editor}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={onKeyDown}
      readOnly={readOnly}
      spellCheck={false}
      maxLength={4000}
      aria-label="Your code"
      rows={Math.max(8, value.split("\n").length + 1)}
    />
  );
}
