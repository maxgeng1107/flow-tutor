"use client";

import { useCallback, useEffect, useState } from "react";
import { LEETCODE_URL, ORIGINAL, STEPS, type Picture, type Task } from "@/lib/content";
import {
  currentTask,
  flowReducer,
  initialFlow,
  STUCK_AFTER_MS,
  type FlowAction,
  type FlowState,
  type Phase,
} from "@/lib/flow";
import { loadMastery, NO_MASTERY, saveMastery, type Mastery } from "@/lib/mastery";
import { allPassed, preloadPython, runTests, type RunResult } from "@/lib/runner";
import type { Guard } from "@/lib/tutor";
import AskWhy, { GUARD_NOTES } from "./AskWhy";
import BarPicture from "./BarPicture";
import CodeEditor from "./CodeEditor";
import NumberStep from "./NumberStep";
import RunResults from "./RunResults";
import styles from "./flow.module.css";

type Hint =
  | { status: "none" }
  | { status: "loading" }
  | { status: "ready"; text: string; guard: Guard }
  | { status: "error"; message: string };

type LastRun = { taskId: string; run: RunResult; runNumber: number; elapsed: string };

// A correct answer waits on screen until "Next". On the steps it has two
// stages: a question to think about first, then (after Next) the rule.
type Passed = { taskId: string; at: number; showRule: boolean };

const start = (mastery: Mastery): FlowState =>
  flowReducer(initialFlow, { type: "start", mastery, at: Date.now() });

// Visiting with ?reset starts with no mastery (for demos). The save effect
// then overwrites what was stored, and the URL is tidied after the first render.
const RESET = typeof window !== "undefined" && new URLSearchParams(window.location.search).has("reset");

function clock(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

function pictureFor(task: Task, solved: boolean): Picture | undefined {
  if (task.number) {
    // The water appears once the student has answered.
    return { heights: task.number.heights, highlight: task.number.highlight, water: solved };
  }
  return task.picture;
}

// What the "correct" box says. `rule` is only set on the steps.
function afterPassing(phase: Phase): { note: string; rule?: string; next: string } {
  switch (phase.kind) {
    case "original":
      return { note: "All tests pass. Now prove it on a problem you haven't seen.", next: "Next: a new problem →" };
    case "ladder": {
      const step = STEPS[phase.step];
      return phase.part === "twin"
        ? { note: "Nice. Same idea as the step before.", rule: step.rule, next: "Next →" }
        : { note: step.reveal, rule: step.rule, next: "Next →" };
    }
    default:
      return { note: "You solved a new problem from a blank editor.", next: "Finish" };
  }
}

export default function FlowTutor() {
  const [flow, setFlow] = useState(() => start(RESET ? NO_MASTERY : loadMastery()));
  const [codeByTask, setCodeByTask] = useState<Record<string, string>>({});
  // After the ladder, the original must be solved with no help on screen.
  const [climbedBack, setClimbedBack] = useState(false);
  const [hint, setHint] = useState<Hint>({ status: "none" });
  const [lastRun, setLastRun] = useState<LastRun | null>(null);
  const [passed, setPassed] = useState<Passed | null>(null);
  const [running, setRunning] = useState(false);
  const [pythonError, setPythonError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const { phase, attempt } = flow;
  const task = currentTask(phase);
  const code = task ? (codeByTask[task.id] ?? task.starter) : "";
  const isPassed = !!task && passed?.taskId === task.id;

  // Pyodide takes a few seconds to load, so start right away.
  useEffect(() => {
    preloadPython().catch((err: Error) => setPythonError(err.message));
    if (RESET) window.history.replaceState(null, "", window.location.pathname);
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
      if (next.phase.kind === "ladder") setClimbedBack(true);
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
      const solving = flow.phase.kind === "original" && passed?.taskId !== ORIGINAL.id;
      if (solving && t - flow.attempt.startedAt > STUCK_AFTER_MS) {
        act({ type: "stuck", at: t });
      }
    }, 1000);
    return () => clearInterval(id);
  }, [flow, act, passed]);

  async function run(t: Task) {
    setRunning(true);
    const result = await runTests(code, t.tests, t.prelude);
    setRunning(false);
    const at = Date.now();
    setLastRun({ taskId: t.id, run: result, runNumber: attempt.runs + 1, elapsed: clock(at - attempt.startedAt) });
    if (allPassed(result)) {
      setPassed({ taskId: t.id, at, showRule: false });
    } else {
      act({ type: "run", passed: false, at });
    }
  }

  function answer(t: Task, correct: boolean) {
    const at = Date.now();
    if (correct) setPassed({ taskId: t.id, at, showRule: false });
    else act({ type: "run", passed: false, at });
  }

  // Forget mastery (the save effect writes the empty record) and start fresh.
  function startOver() {
    setFlow(start(NO_MASTERY));
    setCodeByTask({});
    setClimbedBack(false);
    setHint({ status: "none" });
    setLastRun(null);
    setPassed(null);
  }

  // First Next on a step shows the rule; the next one moves on.
  function goNext() {
    if (!passed) return;
    if (!passed.showRule && phase.kind === "ladder") {
      setPassed({ ...passed, showRule: true });
      return;
    }
    act({ type: "run", passed: true, at: passed.at });
    setPassed(null);
  }

  const inTwin = phase.kind === "ladder" && phase.part === "twin";
  const stuckButton = !inTwin && !isPassed && (
    <button type="button" onClick={() => act({ type: "stuck", at: Date.now() })} disabled={running}>
      I&apos;m stuck
    </button>
  );
  const picture = task && pictureFor(task, isPassed);

  return (
    <div className={styles.page}>
      {phase.kind === "ladder" && <ProgressBar flow={flow} />}

      <div className={styles.columns}>
        <section className={styles.left}>
          {phase.kind === "done" ? (
            <Done mastery={flow.mastery} onStartOver={startOver} />
          ) : phase.kind === "ladder" && phase.part === "solution" ? (
            <Solution step={phase.step} onContinue={() => act({ type: "continue", at: Date.now() })} />
          ) : (
            task && (
              <>
                <h2>{task.title}</h2>
                <p className={styles.statement}>{task.statement}</p>
                {picture && <BarPicture {...picture} />}
                {task.id === ORIGINAL.id && (
                  <p className={styles.dim}>
                    Based on{" "}
                    <a href={LEETCODE_URL} target="_blank" rel="noreferrer">
                      LeetCode 42
                    </a>
                    .
                  </p>
                )}
                {inTwin && !task.number && (
                  <div className={styles.example}>
                    <strong>The step you just saw</strong>
                    <pre>{STEPS[(phase as { step: number }).step].solution}</pre>
                  </div>
                )}

                {task.number ? (
                  !isPassed && (
                    <NumberStep
                      key={task.id}
                      question={task.number}
                      onAnswer={(correct) => answer(task, correct)}
                      stuckButton={stuckButton}
                    />
                  )
                ) : (
                  <>
                    <CodeEditor value={code} onChange={(c) => setCodeByTask((m) => ({ ...m, [task.id]: c }))} />
                    {!isPassed && (
                      <div className={styles.actions}>
                        <button
                          className={styles.primary}
                          onClick={() => run(task)}
                          disabled={running || !!pythonError}
                        >
                          {running ? "Running…" : "Run tests"}
                        </button>
                        {stuckButton}
                        <span className={styles.dim}>{clock(now - attempt.startedAt)}</span>
                      </div>
                    )}
                    {pythonError && <p className={styles.error}>Python failed to load: {pythonError}</p>}
                    {lastRun?.taskId === task.id && (
                      <RunResults run={lastRun.run} runNumber={lastRun.runNumber} elapsed={lastRun.elapsed} />
                    )}
                  </>
                )}

                {isPassed && passed && (
                  <div className={styles.passed}>
                    <strong>✓ {task.number ? `Yes, ${task.number.answer}.` : "Correct."}</strong>
                    <p>{afterPassing(phase).note}</p>
                    {passed.showRule && afterPassing(phase).rule && (
                      <div className={styles.rule}>
                        <strong>The rule</strong>
                        <p>{afterPassing(phase).rule}</p>
                      </div>
                    )}
                    <button
                      key={passed.showRule ? "continue" : "next"}
                      className={styles.primary}
                      onClick={goNext}
                      autoFocus
                    >
                      {passed.showRule ? "Continue →" : afterPassing(phase).next}
                    </button>
                  </div>
                )}
              </>
            )
          )}
        </section>

        <aside className={styles.right}>
          {phase.kind === "original" && climbedBack && (
            <p className={styles.dim}>No hints this time. You built every piece on the way up.</p>
          )}
          {phase.kind === "original" && !climbedBack && (
            <>
              {hint.status === "loading" && <div className={styles.assistant}>Thinking of one good hint…</div>}
              {hint.status === "error" && <p className={styles.error}>{hint.message}</p>}
              {hint.status === "ready" && (
                <div className={styles.assistant}>
                  <strong>Your one hint</strong>
                  <p>{hint.text}</p>
                  {GUARD_NOTES[hint.guard] && <div className={styles.guardNote}>{GUARD_NOTES[hint.guard]}</div>}
                </div>
              )}
            </>
          )}
          {phase.kind === "ladder" && phase.part !== "solution" && task && (
            <AskWhy key={task.id} taskId={task.id} code={code} onAsk={() => act({ type: "helped" })} />
          )}
        </aside>
      </div>

      {phase.kind !== "done" && (
        <footer className={styles.footer}>
          <button type="button" className={styles.linkButton} onClick={startOver}>
            Reset progress
          </button>
        </footer>
      )}
    </div>
  );
}

// Shown only on the ladder: one segment per step. Mastered steps that will be
// skipped are drawn lighter.
function ProgressBar({ flow }: { flow: FlowState }) {
  const { phase, mastery } = flow;
  if (phase.kind !== "ladder") return null;
  const step = STEPS[phase.step];
  const suffix = phase.part === "solution" ? " · the answer" : phase.part === "twin" ? " · one more like it" : "";
  return (
    <div className={styles.progress}>
      <div className={styles.progressTrack}>
        {STEPS.map((s, i) => {
          const state =
            i < phase.step ? styles.segDone
            : i === phase.step ? styles.segCurrent
            : mastery[s.skill] ? styles.segSkip
            : styles.segTodo;
          return <span key={s.skill} className={state} title={s.label} />;
        })}
      </div>
      <p className={styles.dim}>
        Step {phase.step + 1} of {STEPS.length} · {step.label}
        {suffix}
      </p>
    </div>
  );
}

function Solution({ step, onContinue }: { step: number; onContinue: () => void }) {
  const s = STEPS[step];
  const q = s.task.number;
  return (
    <>
      <h2>{s.task.title}: the answer</h2>
      <p className={styles.statement}>
        Two misses, so here&apos;s the answer for this step only. Then try one more like it yourself.
      </p>
      {q ? (
        <>
          <BarPicture heights={q.heights} highlight={q.highlight} water />
          <p className={styles.statement}>{s.solution}</p>
        </>
      ) : (
        <>
          {s.task.picture && <BarPicture {...s.task.picture} />}
          <pre className={styles.solution}>{s.solution}</pre>
        </>
      )}
      <div className={styles.actions}>
        <button className={styles.primary} onClick={onContinue} autoFocus>
          Try one more like it
        </button>
      </div>
    </>
  );
}

function Done({ mastery, onStartOver }: { mastery: Mastery; onStartOver: () => void }) {
  return (
    <>
      <h2>Done 🎉</h2>
      <p className={styles.statement}>
        You solved Trapping Rain Water, then a new problem with the same idea from a blank editor.
        These skills are marked mastered, so next time the steps skip them.
      </p>
      <ul className={styles.doneList}>
        {STEPS.map((s) => (
          <li key={s.skill}>
            {mastery[s.skill] ? "✓" : "·"} {s.label}
          </li>
        ))}
      </ul>
      <div className={styles.actions}>
        <button type="button" onClick={onStartOver}>
          Start over
        </button>
        <span className={styles.dim}>Forgets your progress on this device.</span>
      </div>
    </>
  );
}
