// Layer 2: the output filter. Plain code that inspects the model's reply before
// the student sees it. It doesn't care what the student said or whether the
// model was persuaded; it only counts code. (The "metal detector".)

import type { HintLevel } from "./prompt";

// A hint may quote or sketch a little code, but more than this is a solution.
const MAX_NEW_CODE_LINES_PER_REPLY = 3;
// Stops "show me one line at a time" from leaking the answer over many turns.
const MAX_NEW_CODE_LINES_PER_CHAT = 6;
// Quoting a chunk of the student's code is fine; quoting it with edits is not.
const MAX_QUOTED_CODE_LINES = 5;

const normalize = (line: string) => line.replace(/\s+/g, " ").trim();

// Outside code fences, a line counts as code if it looks like Python
// (keyword ... colon, return, assignment) or C-style (ends in ; { or }).
function looksLikeCode(line: string): boolean {
  return (
    /^(def|for|while|if|elif|else|try|except|with|class)\b.*:$/.test(line) ||
    /^return\b/.test(line) ||
    /^[A-Za-z_][\w.]*(\[[^\]]*\])?\s*([+\-*/]?=)\s*[^=\s]/.test(line) ||
    /[;{}]$/.test(line)
  );
}

// Every line of code in a reply, normalized.
export function codeLines(text: string): string[] {
  const found: string[] = [];
  let inFence = false;
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (line.startsWith("```")) {
      inFence = !inFence;
      continue;
    }
    if (!line) continue;
    if (inFence) {
      found.push(normalize(line));
      continue;
    }
    // Strip list markers and inline backticks so "- `x = 1`" is seen as "x = 1".
    const bare = line.replace(/^([-*]|\d+[.)])\s+/, "").replace(/^`+|`+$/g, "");
    if (looksLikeCode(bare)) {
      found.push(normalize(bare));
      continue;
    }
    // Inline code inside a sentence: "Next line: `best = max(best, current)`".
    for (const [, span] of line.matchAll(/`([^`]+)`/g)) {
      if (looksLikeCode(span.trim())) found.push(normalize(span));
    }
  }
  return found;
}

// Code lines that are NOT just quotes of the student's own code. Pointing at
// the student's buggy line is a valid level-2 hint, so it shouldn't count.
function newCodeLines(text: string, studentCode: string): string[] {
  const own = new Set(studentCode.split("\n").map(normalize).filter(Boolean));
  return codeLines(text).filter((line) => !own.has(line));
}

// Returns why the reply leaks a solution, or null if it's safe to show.
export function findLeak(
  reply: string,
  studentCode: string,
  earlierReplies: string[],
): string | null {
  const fresh = newCodeLines(reply, studentCode);
  if (fresh.length > MAX_NEW_CODE_LINES_PER_REPLY) {
    return `${fresh.length} new lines of code in one reply`;
  }
  // Their whole function sent back with a few lines changed is a corrected
  // solution, even though most of the lines are "theirs".
  if (fresh.length > 0 && codeLines(reply).length > MAX_QUOTED_CODE_LINES) {
    return "sends back an edited copy of the student's code";
  }

  const total = new Set(fresh);
  for (const earlier of earlierReplies) {
    for (const line of newCodeLines(earlier, studentCode)) total.add(line);
  }
  if (total.size > MAX_NEW_CODE_LINES_PER_CHAT) {
    return `${total.size} new lines of code across the conversation`;
  }
  return null;
}

// Shown when the model leaks twice in a row. Written by hand, so it can't leak.
const FALLBACK_HINTS: Record<HintLevel, string> = {
  1: "I can't hand you the solution, but here's something to think about: trace your code by hand on [1, 2, 2, 2]. When the loop ends, has the last streak ever been compared with your best so far?",
  2: "I can't write it for you, but look at where you update your best count. It only happens when a streak breaks, so a streak that runs to the end of the list is never checked. Also try a one-item list like [5].",
  3: "I can't give you the code, but here's a plan in words: handle the empty list first; keep a count for the current streak and one for the best; grow the current count when a number repeats and reset it otherwise; and after the loop, compare the final streak with the best one more time. Try writing it yourself!",
};

export function fallbackHint(level: HintLevel): string {
  return FALLBACK_HINTS[level];
}
