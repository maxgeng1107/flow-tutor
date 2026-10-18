// Browser-side wrapper around public/pyodide-worker.js. Correctness is judged
// here by real tests, never by the LLM.

import type { Test } from "./content";

export type TestResult = Test & { got: string; pass: boolean };
export type RunResult = {
  error: string | null;
  results: TestResult[];
  stdout: string;
  ms: number;
};

const TIMEOUT_MS = 5000;

let worker: Worker | null = null;
let ready: Promise<void> | null = null;

// Loading Pyodide takes a few seconds, so start it early and reuse the worker.
export function preloadPython(): Promise<void> {
  if (ready) return ready;
  const w = new Worker("/pyodide-worker.js");
  worker = w;
  ready = new Promise((resolve, reject) => {
    w.onmessage = (event) => {
      if (event.data.type === "ready") resolve();
      if (event.data.type === "load-error") reject(new Error(event.data.message));
    };
    w.onerror = () => reject(new Error("Couldn't start Python."));
  });
  return ready;
}

export function allPassed(run: RunResult): boolean {
  return !run.error && run.results.length > 0 && run.results.every((r) => r.pass);
}

export async function runTests(
  code: string,
  tests: Test[],
  prelude = "",
): Promise<RunResult> {
  await preloadPython();
  const w = worker!;
  const started = performance.now();

  return new Promise((resolve) => {
    // An infinite loop never answers. Kill the worker; the next run starts a new one.
    const timer = setTimeout(() => {
      w.terminate();
      worker = null;
      ready = null;
      resolve({
        error: `Stopped after ${TIMEOUT_MS / 1000} s. Is there an infinite loop?`,
        results: [],
        stdout: "",
        ms: TIMEOUT_MS,
      });
    }, TIMEOUT_MS);

    w.onmessage = (event) => {
      if (event.data.type !== "result") return;
      clearTimeout(timer);
      resolve({ ...event.data.result, ms: Math.round(performance.now() - started) });
    };
    w.postMessage({ code, tests, prelude });
  });
}
