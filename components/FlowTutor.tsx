"use client";

import { useCallback, useEffect, useState } from "react";
import {
  LEETCODE_URL,
  ORIGINAL,
  STEPS,
  barCells,
  type Task,
} from "@/lib/content";
import {
  currentTask,
  flowReducer,
  initialFlow,
  STUCK_AFTER_MS,
  type FlowAction,
  type FlowState,
} from "@/lib/flow";
import { clearMastery, loadMastery, saveMastery, NO_MASTERY, type Mastery } from "@/lib/mastery";
import { allPassed, preloadPython, runTests, type RunResult } from "@/lib/runner";
import type { Guard } from "@/lib/tutor";
import AskWhy, { GUARD_NOTES } from "./AskWhy";
import CodeEditor from "./CodeEditor";
import RunResults from "./RunResults";
import styles from "./flow.module.css";

type Hint =
  | { status: "none" }
  | { status: "loading" }
  | { status: "ready"; text: string; guard: Guard }
  | { status: "error"; message: string };

type LastRun = { taskId: string; run: RunResult; runNumber: number; elapsed: string };

const start = (mastery: Mastery): FlowState =>
  flowReducer(initialFlow, { type: "start", mastery, at: Date.now() });

function clock(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export default function FlowTutor() {
  const [flow, setFlow] = useState(() => start(loadMastery()));
  const [codeByTask, setCodeByTask] = useState<Record<string, string>>({});
  // Code that passed each ladder step, shown as "what you built" on the way back up.
  const [built, setBuilt] = useState<Record<string, string>>({});
  const [hint, setHint] = useState<Hint>({ status: "none" });
  const [lastRun, setLastRun] = useState<LastRun | null>(null);
  const [running, setRunning] = useState(false);
  const [pythonError, setPythonError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const { phase, attempt } = flow;
  const task = currentTask(phase);
  const code = task ? (codeByTask[task.id] ?? task.starter) : "";

  // Pyodide takes a few seconds to load, so start right away.
  useEffect(() => {
    preloadPython().catch((err: Error) => setPythonError(err.message));
  }, []);

  useEffect(() => saveMastery(flow.mastery), [flow.mastery]);

  async function requestHint(studentCode: string) {
    setHint({ status: "loading" });
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "hint", taskId: ORIGINAL.id, code: studentCode, messages: [] }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Request failed.");
      setHint({ status: "ready", text: data.reply, guard: data.guard });
    } catch (err) {
      setHint({ status: "error", message: err instanceof Error ? err.message : "Request failed." });
    }
  }

  // Every transition goes through here. The single hint is fetched the first
  // time the original problem becomes "hinted", and never again.
  const act = useCallback(
    (action: FlowAction) => {
      const next = flowReducer(flow, action);
      setFlow(next);
      const nowHinted = next.phase.kind === "original" && next.phase.hinted;
      if (nowHinted && hint.status === "none") {
        requestHint(codeByTask[ORIGINAL.id] ?? ORIGINAL.starter);
      }
    },
    [flow, hint.status, codeByTask],
  );

  // A clock for the UI, plus the "8 minutes with no passing run" stuck rule.
  useEffect(() => {
    const id = setInterval(() => {
      const t = Date.now();
      setNow(t);
      if (flow.phase.kind === "original" && t - flow.attempt.startedAt > STUCK_AFTER_MS) {
        act({ type: "stuck", at: t });
      }
    }, 1000);
    return () => clearInterval(id);
  }, [flow, act]);

  async function run(t: Task) {
    setRunning(true);
    const result = await runTests(code, t.tests, t.prelude);
    setRunning(false);
    const at = Date.now();
    setLastRun({
      taskId: t.id,
      run: result,
      runNumber: attempt.runs + 1,
      elapsed: clock(at - attempt.startedAt),
    });
    const passed = allPassed(result);
    if (passed && phase.kind === "ladder") setBuilt((b) => ({ ...b, [t.id]: code }));
    act({ type: "run", passed, at });
  }

  function restart(mastery: Mastery) {
    setFlow(start(mastery));
    setCodeByTask({});
    setBuilt({});
    setHint({ status: "none" });
    setLastRun(null);
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <h1>Flow Tutor</h1>
          <p className={styles.dim}>
            One hint. Still stuck? Smaller steps, then back up. Then prove it on a new problem.
          </p>
        </div>
        <div className={styles.headerButtons}>
          <button onClick={() => restart(flow.mastery)}>Start over</button>
          <button
            onClick={() => {
              clearMastery();
              restart(NO_MASTERY);
            }}
          >
            Forget mastery
          </button>
        </div>
      </header>

      <Progress flow={flow} />

      <div className={styles.columns}>
        <section className={styles.left}>
          {phase.kind === "done" ? (
            <Done mastery={flow.mastery} />
          ) : phase.kind === "ladder" && phase.part === "solution" ? (
            <Solution
              step={phase.step}
              onContinue={() => act({ type: "continue", at: Date.now() })}
            />
          ) : (
            task && (
              <>
                <h2>{task.title}</h2>
                <p className={styles.statement}>{task.statement}</p>
                {task.id === ORIGINAL.id && (
                  <>
                    <Bars heights={[4, 2, 0, 3, 2, 5]} />
                    <p className={styles.dim}>
                      [4, 2, 0, 3, 2, 5] holds 9 units of water (blue). Based on{" "}
                      <a href={LEETCODE_URL} target="_blank" rel="noreferrer">
                        LeetCode 42, Trapping Rain Water
                      </a>
                      .
                    </p>
                  </>
                )}
                {phase.kind === "ladder" && phase.part === "step" && (
                  <div className={styles.example}>
                    <strong>Worked example</strong>
                    <pre>{STEPS[phase.step].example}</pre>
                  </div>
                )}
                {phase.kind === "ladder" && phase.part === "twin" && (
                  <div className={styles.example}>
                    <strong>The step you just saw</strong>
                    <pre>{STEPS[phase.step].solution}</pre>
                  </div>
                )}
                <CodeEditor
                  value={code}
                  onChange={(c) => setCodeByTask((m) => ({ ...m, [task.id]: c }))}
                />
                <div className={styles.actions}>
                  <button
                    className={styles.primary}
                    onClick={() => run(task)}
                    disabled={running || !!pythonError}
                  >
                    {running ? "Running…" : "Run tests"}
                  </button>
                  {!(phase.kind === "ladder" && phase.part === "twin") && (
                    <button onClick={() => act({ type: "stuck", at: Date.now() })} disabled={running}>
                      I&apos;m stuck
                    </button>
                  )}
                  <span className={styles.dim}>
                    {clock(now - attempt.startedAt)} on this task
                  </span>
                </div>
                {pythonError && <p className={styles.error}>Python failed to load: {pythonError}</p>}
                {lastRun?.taskId === task.id && (
                  <RunResults run={lastRun.run} runNumber={lastRun.runNumber} elapsed={lastRun.elapsed} />
                )}
              </>
            )
          )}
        </section>

        <aside className={styles.right}>
          <h2>Tutor</h2>
          {phase.kind === "original" && (
            <>
              {hint.status === "none" && (
                <p className={styles.dim}>
                  Try it first. Stuck? Press <b>I&apos;m stuck</b> once for a single hint. Press it
                  again (or fail two runs) and we&apos;ll rebuild the path in small steps instead of
                  piling on more hints.
                </p>
              )}
              {hint.status === "loading" && <div className={styles.assistant}>Thinking of one good hint…</div>}
              {hint.status === "error" && <p className={styles.error}>{hint.message}</p>}
              {hint.status === "ready" && (
                <div className={styles.assistant}>
                  <strong>Your one hint</strong>
                  <p>{hint.text}</p>
                  {GUARD_NOTES[hint.guard] && <div className={styles.guardNote}>{GUARD_NOTES[hint.guard]}</div>}
                </div>
              )}
              <Built built={built} />
            </>
          )}
          {phase.kind === "ladder" && phase.part !== "solution" && task && (
            <AskWhy
              key={task.id}
              taskId={task.id}
              code={code}
              onAsk={() => act({ type: "helped" })}
            />
          )}
          {phase.kind === "ladder" && phase.part === "solution" && (
            <p className={styles.dim}>
              Read the answer for this step, then do its twin. Seeing one and doing a near-identical
              one beats staring at a blank editor.
            </p>
          )}
          {phase.kind === "transfer" && (
            <p className={styles.dim}>
              No hints here. If you&apos;re stuck, press <b>I&apos;m stuck</b> and we&apos;ll go back
              down the ladder to the part that needs work (skipping what you&apos;ve mastered).
            </p>
          )}
          {phase.kind === "done" && <p className={styles.dim}>Nothing to help with. You did it.</p>}
        </aside>
      </div>
    </div>
  );
}

function Bars({ heights }: { heights: number[] }) {
  return (
    <div className={styles.bars} aria-label={`Bars ${heights.join(", ")} with trapped water`}>
      {barCells(heights).map((row, y) => (
        <div key={y}>
          {row.map((cell, x) => (
            <span key={x} className={styles[cell]} />
          ))}
        </div>
      ))}
    </div>
  );
}

function Progress({ flow }: { flow: FlowState }) {
  const { phase, mastery } = flow;
  const items = [
    { id: "original", label: "Original", active: phase.kind === "original" },
    ...STEPS.map((s, i) => ({
      id: s.skill,
      label: s.label.split(" · ")[0],
      active: phase.kind === "ladder" && phase.step === i,
      mastered: mastery[s.skill],
    })),
    { id: "transfer", label: "Transfer", active: phase.kind === "transfer" },
    { id: "done", label: "Done", active: phase.kind === "done" },
  ];
  return (
    <ol className={styles.progress}>
      {items.map((item) => (
        <li
          key={item.id}
          className={item.active ? styles.active : undefined}
          title={"mastered" in item && item.mastered ? "Mastered: skipped on the ladder" : undefined}
        >
          {item.label}
          {"mastered" in item && item.mastered ? " ✓" : ""}
        </li>
      ))}
    </ol>
  );
}

function Solution({ step, onContinue }: { step: number; onContinue: () => void }) {
  const s = STEPS[step];
  return (
    <>
      <h2>{s.task.title}: the answer</h2>
      <p className={styles.statement}>
        Two misses on this step, so here is its full answer (this step only, not the whole
        problem). Read it next to the example, then do a near-identical twin yourself.
      </p>
      <div className={styles.example}>
        <strong>Worked example</strong>
        <pre>{s.example}</pre>
      </div>
      <pre className={styles.solution}>{s.solution}</pre>
      <div className={styles.actions}>
        <button className={styles.primary} onClick={onContinue}>
          Try the twin
        </button>
      </div>
    </>
  );
}

function Built({ built }: { built: Record<string, string> }) {
  // A step solved via the floor shows its answer (which the student studied
  // and then reproduced in the twin), since the twin itself isn't reusable.
  const pieces = STEPS.flatMap((s) => {
    const code = built[s.task.id] ?? (built[s.twin.id] ? s.solution : null);
    return code ? [{ skill: s.skill, code }] : [];
  });
  if (pieces.length === 0) return null;
  return (
    <div className={styles.built}>
      <strong>What you built on the way</strong>
      <p className={styles.dim}>You can reuse these in your solution.</p>
      {pieces.map((p) => (
        <pre key={p.skill}>{p.code}</pre>
      ))}
    </div>
  );
}

function Done({ mastery }: { mastery: Mastery }) {
  return (
    <>
      <h2>Done 🎉</h2>
      <p className={styles.statement}>
        You solved Trapping Rain Water and then a new problem with the same idea from a blank
        editor. Every skill below is marked mastered, so next time the ladder skips them.
      </p>
      <ul>
        {STEPS.map((s) => (
          <li key={s.skill}>
            {mastery[s.skill] ? "✓" : "·"} {s.label}
          </li>
        ))}
      </ul>
    </>
  );
}
