// Which skills the student has mastered, kept in this browser's localStorage.
// Storage can be blocked (private mode, previews), so every access is guarded
// and the app still works without it; it just won't remember.

import { STEPS, type SkillId } from "./content";

export type Mastery = Record<SkillId, boolean>;
type Stored = Partial<Record<SkillId, { mastered: true; at: number }>>;

const KEY = "flow-tutor-mastery";

export const NO_MASTERY: Mastery = Object.fromEntries(
  STEPS.map((s) => [s.skill, false]),
) as Mastery;

function readStored(): Stored {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "{}") as Stored;
  } catch {
    return {};
  }
}

export function loadMastery(): Mastery {
  const stored = readStored();
  return Object.fromEntries(
    STEPS.map((s) => [s.skill, stored[s.skill]?.mastered === true]),
  ) as Mastery;
}

export function saveMastery(mastery: Mastery): void {
  const before = readStored();
  const next: Stored = {};
  for (const s of STEPS) {
    // Keep the original timestamp for skills that were already mastered.
    if (mastery[s.skill]) next[s.skill] = before[s.skill] ?? { mastered: true, at: Date.now() };
  }
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // Storage unavailable: mastery lasts for this visit only.
  }
}
