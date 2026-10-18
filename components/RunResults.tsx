import type { RunResult } from "@/lib/runner";
import styles from "./flow.module.css";

type Props = {
  run: RunResult;
  runNumber: number;
  elapsed: string; // time on this task when the run happened
};

export default function RunResults({ run, runNumber, elapsed }: Props) {
  const passed = run.results.filter((r) => r.pass).length;
  return (
    <div className={styles.results}>
      <p className={styles.meta}>
        Run {runNumber} · {elapsed} on this task ·{" "}
        {run.error ? "error" : `${passed}/${run.results.length} tests passed`} ·{" "}
        {run.ms} ms
      </p>
      {run.error && <pre className={styles.errorBox}>{run.error}</pre>}
      <ul className={styles.tests}>
        {run.results.map((r) => (
          <li key={r.call} className={r.pass ? styles.pass : styles.fail}>
            <span>{r.pass ? "✓" : "✗"}</span>
            <code>{r.call}</code>
            {r.pass ? (
              <span className={styles.dim}>→ {r.expected}</span>
            ) : (
              <span className={styles.dim}>
                expected {r.expected}, got {r.got}
              </span>
            )}
          </li>
        ))}
      </ul>
      {run.stdout && (
        <>
          <p className={styles.meta}>Printed output</p>
          <pre className={styles.stdout}>{run.stdout}</pre>
        </>
      )}
    </div>
  );
}
