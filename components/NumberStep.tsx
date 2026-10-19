import { useState, type FormEvent } from "react";
import type { NumberQuestion } from "@/lib/content";
import styles from "./flow.module.css";

type Props = {
  question: NumberQuestion;
  onAnswer: (correct: boolean) => void;
  stuckButton: React.ReactNode;
};

// A step answered with one number. Keyed by task, so it resets per step.
export default function NumberStep({ question, onAnswer, stuckButton }: Props) {
  const [value, setValue] = useState("");
  const [wrong, setWrong] = useState(false);

  function check(event: FormEvent) {
    event.preventDefault();
    if (value.trim() === "") return;
    const correct = Number(value) === question.answer;
    setWrong(!correct);
    if (!correct) setValue("");
    onAnswer(correct);
  }

  return (
    <form onSubmit={check} className={styles.numberForm}>
      <input
        type="number"
        inputMode="numeric"
        min={0}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        aria-label="Your answer"
        placeholder="?"
        autoFocus
      />
      <button type="submit" className={styles.primary} disabled={value.trim() === ""}>
        Check
      </button>
      {stuckButton}
      {wrong && <span className={styles.error}>Not quite. Look at the picture again.</span>}
    </form>
  );
}
