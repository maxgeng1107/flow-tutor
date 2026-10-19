// All the teaching content. Hand-written and static on purpose: the LLM never
// generates steps or judges correctness, so this part can't hallucinate.
//
// The ladder starts with pictures and single numbers, then turns what the
// student noticed into a formula, then into code. Each gap is small enough to
// cross in about a minute.

export type Test = { call: string; expected: string };

// A row of bars drawn on screen. `labels` is an optional row of numbers under
// the bars (e.g. "tallest so far"), `water` fills in the trapped water.
export type Picture = {
  heights: number[];
  highlight?: number;
  water?: boolean;
  labels?: (number | string)[];
  caption?: string;
};

// A step answered with one number by reading a picture, not by writing code.
export type NumberQuestion = {
  heights: number[];
  highlight: number;
  answer: number;
};

export type Task = {
  id: string;
  title: string;
  statement: string;
  starter: string;
  tests: Test[];
  number?: NumberQuestion;
  picture?: Picture;
  // Hidden code run before the student's (e.g. helpers from earlier steps).
  prelude?: string;
  // The one line the student fills in. The tutor must never write it.
  keyLine?: string;
};

export type SkillId =
  | "dip"
  | "far_walls"
  | "rule"
  | "prefix_max"
  | "suffix_max"
  | "combine";

export type Step = {
  skill: SkillId;
  label: string; // short name for the progress bar
  task: Task;
  // Shown right after a correct answer: a question to think about first.
  reveal: string;
  // Shown when the student clicks Next: the rule this step was teaching.
  rule: string;
  // Shown only if the student misses this step twice (the "floor").
  solution: string;
  // Near-identical task to do right after seeing the solution.
  twin: Task;
};

const tests = (fn: string, cases: [string, string][]): Test[] =>
  cases.map(([args, expected]) => ({ call: `${fn}(${args})`, expected }));

const numberTask = (
  id: string,
  title: string,
  statement: string,
  number: NumberQuestion,
): Task => ({ id, title, statement, starter: "", tests: [], number });

export const LEETCODE_URL = "https://leetcode.com/problems/trapping-rain-water/";

export const ORIGINAL: Task = {
  id: "original",
  title: "Rain on a skyline",
  statement: `Each number is the height of a bar 1 unit wide. When it rains, water fills the dips between bars. Write trap(heights) that returns how many units of water stay.`,
  starter: `def trap(heights):
    # Return the total units of water trapped between the bars.
    pass
`,
  tests: tests("trap", [
    ["[0,1,0,2,1,0,1,3,2,1,2,1]", "6"],
    ["[4,2,0,3,2,5]", "9"],
    ["[]", "0"],
    ["[3]", "0"],
    ["[1,2,3]", "0"],
    ["[3,2,1]", "0"],
    ["[2,0,2]", "2"],
  ]),
  picture: {
    heights: [4, 2, 0, 3, 2, 5],
    water: true,
    caption: "trap([4, 2, 0, 3, 2, 5]) = 9 (the blue squares)",
  },
};

// The one direction the single LLM hint should point toward.
export const HINT_GOAL =
  "For one position, what decides how high the water can rise there?";

// Reference helpers, available in the last step and its twin as if the student wrote them.
const HELPERS = `def water_at(left_max, right_max, h):
    return min(left_max, right_max) - h

def prefix_max(a):
    out, best = [], 0
    for x in a:
        best = max(best, x)
        out.append(best)
    return out

def suffix_max(a):
    out, best = [0] * len(a), 0
    for i in range(len(a) - 1, -1, -1):
        best = max(best, a[i])
        out[i] = best
    return out
`;

export const STEPS: Step[] = [
  {
    skill: "dip",
    label: "One dip",
    task: numberTask(
      "s1",
      "How much water?",
      "It rains. How many squares of water sit above the highlighted bar?",
      { heights: [3, 0, 2], highlight: 1, answer: 2 },
    ),
    reveal: "Before you move on: why 2, and not 3?",
    rule:
      "Water can only rise as high as the shorter wall. Any higher and it spills over that side.",
    solution:
      "Water would spill over the shorter wall, so it can only rise to height 2. The highlighted bar is 0 tall, so 2 squares of water sit on it.",
    twin: numberTask(
      "s1-twin",
      "How much water? (again)",
      "Same question, new bars. How many squares of water sit above the highlighted bar?",
      { heights: [1, 0, 4], highlight: 1, answer: 1 },
    ),
  },
  {
    skill: "far_walls",
    label: "Far walls",
    task: numberTask(
      "s2",
      "Walls far away",
      "Now the walls aren't right next to it, and the bar has its own height. How many squares of water sit above the highlighted bar?",
      { heights: [4, 0, 1, 0, 3], highlight: 2, answer: 2 },
    ),
    reveal: "Its neighbors were both 0, so they didn't decide anything. Which bars did?",
    rule:
      "The walls aren't the neighbors. They're the tallest bar anywhere on the left and the tallest anywhere on the right. Water rises to the shorter of the two, and the bar's own height fills part of that: 3 − 1 = 2.",
    solution:
      "Look past the neighbors: the tallest bar anywhere on the left is 4, the tallest anywhere on the right is 3. Water rises to the shorter of those, 3. The bar itself fills 1 of that, so 3 − 1 = 2 squares.",
    twin: numberTask(
      "s2-twin",
      "Walls far away (again)",
      "How many squares of water sit above the highlighted bar?",
      { heights: [2, 1, 0, 1, 3], highlight: 1, answer: 1 },
    ),
  },
  {
    skill: "rule",
    label: "The rule",
    task: {
      id: "s3",
      title: "Turn it into a rule",
      statement:
        "You just did this twice in your head. Write the rule: given the tallest bar on the left, the tallest on the right, and the bar's own height, return the water above it.",
      picture: {
        heights: [4, 0, 1, 0, 3],
        highlight: 2,
        water: true,
        caption: "Last step: tallest left 4, tallest right 3, height 1 → 2 squares",
      },
      starter: `def water_at(left_max, right_max, h):
    # left_max:  tallest bar from the start up to here (this bar included)
    # right_max: tallest bar from here to the end (this bar included)
    # h:         height of this bar
    return ...  # fill in this line
`,
      tests: tests("water_at", [
        ["4, 3, 1", "2"],
        ["3, 2, 0", "2"],
        ["4, 4, 0", "4"],
        ["2, 5, 2", "0"],
      ]),
      keyLine: "min(left_max, right_max) - h",
    },
    reveal: "Could this ever give a negative number? Why not?",
    rule:
      "Water above a bar = min(tallest left, tallest right) − its height. That's the whole idea of Trapping Rain Water. The rest is finding the two walls for every bar, fast.",
    solution: `def water_at(left_max, right_max, h):
    return min(left_max, right_max) - h`,
    twin: {
      id: "s3-twin",
      title: "The rule, new names",
      statement:
        "Same rule, new story: a hiker stands in a valley between two peaks. How deep would a flood be where they stand?",
      starter: `def flood_at(left_peak, right_peak, h):
    return ...  # fill in this line
`,
      tests: tests("flood_at", [
        ["5, 3, 1", "2"],
        ["2, 2, 2", "0"],
        ["6, 7, 3", "3"],
      ]),
      keyLine: "min(left_peak, right_peak) - h",
    },
  },
  {
    skill: "prefix_max",
    label: "Tallest from the left",
    task: {
      id: "s4",
      title: "Tallest so far, from the left",
      statement:
        "The rule needs left_max for every bar. Return a list where out[i] is the tallest bar from the start up to i.",
      picture: {
        heights: [1, 3, 2, 5, 4],
        labels: [1, 3, 3, 5, 5],
        caption: "Blue numbers: the tallest bar seen so far, walking left to right",
      },
      starter: `def prefix_max(a):
    out = []
    best = 0  # heights are never negative
    for x in a:
        ...  # update best using x
        out.append(best)
    return out
`,
      tests: tests("prefix_max", [
        ["[0,1,0,2]", "[0,1,1,2]"],
        ["[3,1,2]", "[3,3,3]"],
        ["[]", "[]"],
      ]),
      keyLine: "best = max(best, x)",
    },
    reveal: "How many times does your loop look at each bar?",
    rule:
      "A running maximum gives the left wall for every bar in one pass: each new bar is compared once with the record so far. That's O(n).",
    solution: `def prefix_max(a):
    out = []
    best = 0
    for x in a:
        best = max(best, x)
        out.append(best)
    return out`,
    twin: {
      id: "s4-twin",
      title: "Shortest so far",
      statement: "Same walk, but keep the SHORTEST value seen so far.",
      starter: `def prefix_min(a):
    out = []
    best = float("inf")  # bigger than any number
    for x in a:
        ...  # update best using x
        out.append(best)
    return out
`,
      tests: tests("prefix_min", [
        ["[3,1,2]", "[3,1,1]"],
        ["[5,6,4]", "[5,5,4]"],
        ["[]", "[]"],
      ]),
      keyLine: "best = min(best, x)",
    },
  },
  {
    skill: "suffix_max",
    label: "Tallest from the right",
    task: {
      id: "s5",
      title: "Tallest so far, from the right",
      statement:
        "Same thing from the other side: out[i] is the tallest bar from i to the end. Walk from the right and fill each slot.",
      picture: {
        heights: [4, 1, 3, 2],
        labels: [4, 3, 3, 2],
        caption: "Blue numbers: the tallest bar seen so far, walking right to left",
      },
      starter: `def suffix_max(a):
    out = [0] * len(a)
    best = 0
    for i in range(len(a) - 1, -1, -1):  # last index down to 0
        best = max(best, a[i])
        ...  # save best for position i
    return out
`,
      tests: tests("suffix_max", [
        ["[2,0,1]", "[2,1,1]"],
        ["[1,2,3]", "[3,3,3]"],
        ["[]", "[]"],
      ]),
      keyLine: "out[i] = best",
    },
    reveal: "Why does this loop have to walk backwards?",
    rule:
      "The same running maximum, walked from the right, gives every bar its right wall. Now each bar knows both of its walls.",
    solution: `def suffix_max(a):
    out = [0] * len(a)
    best = 0
    for i in range(len(a) - 1, -1, -1):
        best = max(best, a[i])
        out[i] = best
    return out`,
    twin: {
      id: "s5-twin",
      title: "Shortest from the right",
      statement:
        "Same backwards walk, but out[i] is the SHORTEST value from i to the end. This time the saving line is done; fill in the update.",
      starter: `def suffix_min(a):
    out = [0] * len(a)
    best = float("inf")
    for i in range(len(a) - 1, -1, -1):
        ...  # update best using a[i]
        out[i] = best
    return out
`,
      tests: tests("suffix_min", [
        ["[2,0,1]", "[0,0,1]"],
        ["[3,2,1]", "[1,1,1]"],
        ["[]", "[]"],
      ]),
      keyLine: "best = min(best, a[i])",
    },
  },
  {
    skill: "combine",
    label: "Put it together",
    task: {
      id: "s6",
      title: "Put it together",
      statement:
        "water_at, prefix_max and suffix_max are already defined (the ones you just wrote). Add up the water above every bar.",
      picture: {
        heights: [3, 0, 1, 3],
        water: true,
        labels: [0, 3, 2, 0],
        caption: "Blue numbers: water above each bar. Total 0 + 3 + 2 + 0 = 5",
      },
      starter: `def trap(heights):
    left = prefix_max(heights)
    right = suffix_max(heights)
    total = 0
    for i in range(len(heights)):
        total += ...  # water above bar i
    return total
`,
      tests: ORIGINAL.tests,
      prelude: HELPERS,
      keyLine: "water_at(left[i], right[i], heights[i])",
    },
    reveal: "How many passes over the bars does your whole solution make?",
    rule:
      "Two scans find the walls, one more pass adds up the water: O(n) time. That's Trapping Rain Water. Next: the original problem, on your own, with no help on screen.",
    solution: `def trap(heights):
    left = prefix_max(heights)
    right = suffix_max(heights)
    total = 0
    for i in range(len(heights)):
        total += water_at(left[i], right[i], heights[i])
    return total`,
    twin: {
      id: "s6-twin",
      title: "Deepest spot",
      statement:
        "Same pieces, new question: return the depth of the DEEPEST single spot of water (0 if there's none).",
      starter: `def deepest(heights):
    left = prefix_max(heights)
    right = suffix_max(heights)
    best = 0
    for i in range(len(heights)):
        best = ...  # deepest so far
    return best
`,
      tests: tests("deepest", [
        ["[3,0,1,3]", "3"],
        ["[2,0,2]", "2"],
        ["[4,2,0,3,2,5]", "4"],
        ["[]", "0"],
        ["[1,2,3]", "0"],
      ]),
      prelude: HELPERS,
      keyLine: "max(best, water_at(left[i], right[i], heights[i]))",
    },
  },
];

// A different-looking problem built on the same idea: a building is hidden
// from both ends exactly when it's no taller than the SHORTER of the tallest
// buildings on each side, i.e. when it sits in a "dip". Copying trap() won't
// work; recognizing the pattern will.
export const TRANSFER: Task = {
  id: "transfer",
  title: "New problem · Street photos",
  statement: `You take one photo from the left end of a street and one from the right end. A building shows up in a photo if it's strictly taller than every building between it and the camera. Write visible_count(heights): how many buildings appear in at least one of the two photos? Blank editor, no hints.`,
  starter: `def visible_count(heights):
    pass
`,
  tests: tests("visible_count", [
    ["[3,1,4,2]", "3"],
    ["[]", "0"],
    ["[5]", "1"],
    ["[1,2,3]", "3"],
    ["[3,2,1]", "3"],
    ["[2,2]", "2"],
    ["[1,3,2,3,1]", "4"],
    ["[5,1,1,1,5]", "2"],
    ["[4,1,5,1,4]", "3"],
  ]),
  picture: {
    heights: [3, 1, 4, 2],
    highlight: 1,
    caption:
      "From the left you see 3 and 4. From the right, 2 and 4. The highlighted 1 is hidden from both, so the answer is 3.",
  },
};

export const ALL_TASKS: Task[] = [
  ORIGINAL,
  ...STEPS.flatMap((s) => [s.task, s.twin]),
  TRANSFER,
];

export function taskById(id: string): Task | undefined {
  return ALL_TASKS.find((t) => t.id === id);
}

// Water above bar i: the shorter of the tallest bars on each side, minus its height.
export function waterLevels(heights: number[]): number[] {
  return heights.map((h, i) =>
    Math.min(Math.max(...heights.slice(0, i + 1)), Math.max(...heights.slice(i))) - h,
  );
}

export type Cell = "bar" | "water" | "air";

// The picture of bars and water, top row first.
export function barCells(heights: number[]): Cell[][] {
  const water = waterLevels(heights);
  const top = Math.max(0, ...heights);
  const rows: Cell[][] = [];
  for (let y = top; y >= 1; y--) {
    rows.push(heights.map((h, i) => (h >= y ? "bar" : h + water[i] >= y ? "water" : "air")));
  }
  return rows;
}
