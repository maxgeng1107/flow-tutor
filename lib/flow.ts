// The flow as a pure state machine (a React reducer). No timers, storage or
// network in here, so every transition is easy to read and test.
//
// ORIGINAL ──stuck──▶ one HINT ──still stuck──▶ LADDER (S1→S4, skip mastered)
//    ▲                                              │
//    └──────────────────────────────────────────────┘
// ORIGINAL solved ──▶ TRANSFER ──solved──▶ DONE (all skills mastered)
//                        └──failed──▶ LADDER, then back to TRANSFER

import { ORIGINAL, STEPS, TRANSFER, type Task } from "./content";
import { NO_MASTERY, type Mastery } from "./mastery";

export const FAILS_UNTIL_STUCK = 2;
export const STUCK_AFTER_MS = 8 * 60_000;
export const MASTERY_UNDER_MS = 3 * 60_000;

export type Phase =
  | { kind: "original"; hinted: boolean }
  | {
      kind: "ladder";
      step: number;
      // step: fill the key line. solution: the floor after 2 fails. twin: near-identical retry.
      part: "step" | "solution" | "twin";
      returnTo: "original" | "transfer";
    }
  | { kind: "transfer" }
  | { kind: "done" };

export type Attempt = {
  startedAt: number;
  runs: number;
  failedRuns: number;
  helped: boolean; // asked the tutor during this task
};

export type FlowState = { phase: Phase; attempt: Attempt; mastery: Mastery };

export type FlowAction =
  | { type: "start"; mastery: Mastery; at: number }
  | { type: "run"; passed: boolean; at: number }
  | { type: "stuck"; at: number }
  | { type: "helped" }
  | { type: "continue"; at: number };

const fresh = (at: number): Attempt => ({
  startedAt: at,
  runs: 0,
  failedRuns: 0,
  helped: false,
});

export const initialFlow: FlowState = {
  phase: { kind: "original", hinted: false },
  attempt: fresh(0),
  mastery: NO_MASTERY,
};

export function currentTask(phase: Phase): Task | null {
  switch (phase.kind) {
    case "original":
      return ORIGINAL;
    case "ladder":
      return phase.part === "twin" ? STEPS[phase.step].twin : STEPS[phase.step].task;
    case "transfer":
      return TRANSFER;
    case "done":
      return null;
  }
}

// First step at or after `from` whose skill isn't mastered yet.
function nextOpenStep(mastery: Mastery, from: number): number | null {
  for (let i = from; i < STEPS.length; i++) {
    if (!mastery[STEPS[i].skill]) return i;
  }
  return null;
}

function enterLadder(
  state: FlowState,
  returnTo: "original" | "transfer",
  at: number,
): FlowState {
  // Even if everything is mastered, a stuck student still gets the last step.
  const step = nextOpenStep(state.mastery, 0) ?? STEPS.length - 1;
  return {
    ...state,
    phase: { kind: "ladder", step, part: "step", returnTo },
    attempt: fresh(at),
  };
}

// After a step (or its twin) passes: next open step, or climb back up.
function leaveStep(state: FlowState, at: number): FlowState {
  if (state.phase.kind !== "ladder") return state;
  const next = nextOpenStep(state.mastery, state.phase.step + 1);
  if (next !== null) {
    return {
      ...state,
      phase: { ...state.phase, step: next, part: "step" },
      attempt: fresh(at),
    };
  }
  const phase: Phase =
    state.phase.returnTo === "original"
      ? { kind: "original", hinted: true }
      : { kind: "transfer" };
  return { ...state, phase, attempt: fresh(at) };
}

function onPass(state: FlowState, at: number): FlowState {
  const { phase, attempt } = state;
  switch (phase.kind) {
    case "original":
      return { ...state, phase: { kind: "transfer" }, attempt: fresh(at) };
    case "ladder": {
      if (phase.part !== "step") return leaveStep(state, at);
      // Mastered = first run, no tutor help, under 3 minutes.
      const mastered =
        attempt.runs === 1 &&
        !attempt.helped &&
        at - attempt.startedAt < MASTERY_UNDER_MS;
      const skill = STEPS[phase.step].skill;
      const mastery = mastered ? { ...state.mastery, [skill]: true } : state.mastery;
      return leaveStep({ ...state, mastery }, at);
    }
    case "transfer": {
      // Solving a new problem from a blank editor proves every skill.
      const mastery = Object.fromEntries(
        STEPS.map((s) => [s.skill, true]),
      ) as Mastery;
      return { ...state, phase: { kind: "done" }, mastery };
    }
    case "done":
      return state;
  }
}

function onStuck(state: FlowState, at: number): FlowState {
  const { phase } = state;
  switch (phase.kind) {
    case "original":
      // First time: exactly one hint. Second time: rebuild the path instead.
      if (!phase.hinted) {
        return { ...state, phase: { kind: "original", hinted: true }, attempt: fresh(at) };
      }
      return enterLadder(state, "original", at);
    case "ladder": {
      if (phase.part !== "step") return state;
      // The floor: show this step's solution, then a twin. Revoke the skill.
      const skill = STEPS[phase.step].skill;
      return {
        ...state,
        phase: { ...phase, part: "solution" },
        mastery: { ...state.mastery, [skill]: false },
      };
    }
    case "transfer":
      // Back down the ladder. Combining is the skill that just broke.
      return enterLadder(
        { ...state, mastery: { ...state.mastery, combine: false } },
        "transfer",
        at,
      );
    case "done":
      return state;
  }
}

export function flowReducer(state: FlowState, action: FlowAction): FlowState {
  switch (action.type) {
    case "start":
      return { ...initialFlow, mastery: action.mastery, attempt: fresh(action.at) };
    case "helped":
      return { ...state, attempt: { ...state.attempt, helped: true } };
    case "continue":
      if (state.phase.kind !== "ladder" || state.phase.part !== "solution") return state;
      return { ...state, phase: { ...state.phase, part: "twin" }, attempt: fresh(action.at) };
    case "stuck":
      return onStuck(state, action.at);
    case "run": {
      const attempt = {
        ...state.attempt,
        runs: state.attempt.runs + 1,
        failedRuns: state.attempt.failedRuns + (action.passed ? 0 : 1),
      };
      const next = { ...state, attempt };
      if (action.passed) return onPass(next, action.at);
      // Twins have no floor, so repeated fails there just keep trying.
      if (attempt.failedRuns >= FAILS_UNTIL_STUCK) return onStuck(next, action.at);
      return next;
    }
  }
}
