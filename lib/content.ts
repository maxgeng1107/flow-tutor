// All the teaching content. Hand-written and static on purpose: the LLM never
// generates steps or judges correctness, so this part can't hallucinate.

export type Test = { call: string; expected: string };

export type Task = {
  id: string;
  title: string;
  statement: string;
  starter: string;
  tests: Test[];
  // Hidden code run before the student's (e.g. helpers from earlier steps).
  prelude?: string;
  // The one line the student fills in. The tutor must never write it.
  keyLine?: string;
};

export type SkillId = "single_cell" | "prefix_max" | "suffix_max" | "combine";

export type Step = {
  skill: SkillId;
  label: string;
  task: Task;
  // A worked example on a DIFFERENT input. Steps teach, they don't test.
  example: string;
  // Shown only if the student fails this step twice (the "floor").
  solution: string;
  // Near-identical task to do right after seeing the solution.
  twin: Task;
};

const tests = (fn: string, cases: [string, string][]): Test[] =>
  cases.map(([args, expected]) => ({ call: `${fn}(${args})`, expected }));

export const LEETCODE_URL = "https://leetcode.com/problems/trapping-rain-water/";

export const ORIGINAL: Task = {
  id: "original",
  title: "Rain on a skyline",
  statement: `You get a list of non-negative whole numbers. Each one is the height of a bar 1 unit wide, and the bars stand side by side. When it rains, water collects in the dips between taller bars. It can't rise above the lower edge of a dip, or it spills over.

Write trap(heights) that returns the total units of water left standing.`,
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
};

// The one direction the single LLM hint should point toward.
export const HINT_GOAL =
  "For one position, what decides how high the water can rise there?";

// Reference helpers, available in S4 and its twin as if the student wrote them.
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
    skill: "single_cell",
    label: "S1 · One position",
    task: {
      id: "s1",
      title: "S1 · Water above one bar",
      statement: `Forget the whole skyline. Look at ONE position. You already know the tallest bar to its left (counting itself) and the tallest bar to its right (counting itself). How much water sits on top of it?`,
      starter: `def water_at(left_max, right_max, h):
    # left_max:  tallest bar from the start up to here (this bar included)
    # right_max: tallest bar from here to the end (this bar included)
    # h:         height of this bar
    return ...  # fill in this line
`,
      tests: tests("water_at", [
        ["3, 2, 1", "1"],
        ["4, 4, 0", "4"],
        ["2, 5, 2", "0"],
      ]),
      keyLine: "min(left_max, right_max) - h",
    },
    example: `Heights [2, 0, 3]. Look only at the middle bar (height 0).

  Tallest from the start up to here: 2
  Tallest from here to the end:      3

Water can only rise to the LOWER of the two walls, or it spills
over that side: the lower wall is 2.
The bar itself fills 0 of that height, so the water above it is 2 - 0 = 2.`,
    solution: `def water_at(left_max, right_max, h):
    return min(left_max, right_max) - h`,
    twin: {
      id: "s1-twin",
      title: "S1 twin · Flood at one spot",
      statement: `Same idea, new story. A hiker stands in a valley. The highest point behind them (counting their spot) is left_peak, the highest point ahead (counting their spot) is right_peak, and their spot has height h. How deep would a flood be where they stand?`,
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
    label: "S2 · Tallest from the left",
    task: {
      id: "s2",
      title: "S2 · Tallest so far, from the left",
      statement: `S1 needs left_max for every position. Build them all in one pass: return a list where out[i] is the tallest bar from the start up to and including position i.`,
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
    example: `[1, 3, 2, 5, 4]: walk left to right, keeping the tallest seen so far.

  see 1 → tallest is 1
  see 3 → tallest is 3
  see 2 → still 3
  see 5 → tallest is 5
  see 4 → still 5

Result: [1, 3, 3, 5, 5]. Each step compares one new bar with the record.`,
    solution: `def prefix_max(a):
    out = []
    best = 0
    for x in a:
        best = max(best, x)
        out.append(best)
    return out`,
    twin: {
      id: "s2-twin",
      title: "S2 twin · Shortest so far",
      statement: `Same walk, but keep the SHORTEST value seen so far.`,
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
    label: "S3 · Tallest from the right",
    task: {
      id: "s3",
      title: "S3 · Tallest so far, from the right",
      statement: `S1 also needs right_max for every position: out[i] is the tallest bar from position i to the end. Same idea as S2, but walk from the right and write each answer into its own slot.`,
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
    example: `[4, 1, 3, 2]: start at the END and walk left.

  i=3 sees 2 → tallest is 2 → slot 3 gets 2
  i=2 sees 3 → tallest is 3 → slot 2 gets 3
  i=1 sees 1 → still 3      → slot 1 gets 3
  i=0 sees 4 → tallest is 4 → slot 0 gets 4

Result: [4, 3, 3, 2].`,
    solution: `def suffix_max(a):
    out = [0] * len(a)
    best = 0
    for i in range(len(a) - 1, -1, -1):
        best = max(best, a[i])
        out[i] = best
    return out`,
    twin: {
      id: "s3-twin",
      title: "S3 twin · Shortest from the right",
      statement: `Same backwards walk, but out[i] is the SHORTEST value from position i to the end. This time the saving line is done for you; fill in the update.`,
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
    label: "S4 · Put it together",
    task: {
      id: "s4",
      title: "S4 · Put it together",
      statement: `water_at, prefix_max and suffix_max are already defined for you (the ones from S1–S3). Add up the water at every position.`,
      starter: `def trap(heights):
    left = prefix_max(heights)
    right = suffix_max(heights)
    total = 0
    for i in range(len(heights)):
        total += ...  # water at position i
    return total
`,
      tests: ORIGINAL.tests,
      prelude: HELPERS,
      keyLine: "water_at(left[i], right[i], heights[i])",
    },
    example: `Heights [3, 0, 1, 3]:

  left  = prefix_max → [3, 3, 3, 3]
  right = suffix_max → [3, 3, 3, 3]
  water at each spot → 0, 3, 2, 0   (S1 with left[i], right[i], height i)

Total: 0 + 3 + 2 + 0 = 5.`,
    solution: `def trap(heights):
    left = prefix_max(heights)
    right = suffix_max(heights)
    total = 0
    for i in range(len(heights)):
        total += water_at(left[i], right[i], heights[i])
    return total`,
    twin: {
      id: "s4-twin",
      title: "S4 twin · Deepest spot",
      statement: `Same pieces, new question: return the depth of the DEEPEST single spot of water (0 if there's no water).`,
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

export const TRANSFER: Task = {
  id: "transfer",
  title: "Transfer · Snow between roofs",
  statement: `A street has flat roofs of different heights, each 1 unit wide, side by side. A blizzard fills every gap between roofs with snow. Snow can't pile higher than the lower of the tallest roofs on each side, or the wind blows it away.

Write snow_total(roofs) that returns the total units of snow that stay. Blank editor, no hints: this checks that the idea is yours now.`,
  starter: `def snow_total(roofs):
    pass
`,
  tests: tests("snow_total", [
    ["[3,0,0,2,0,4]", "10"],
    ["[5,2,1,2,1,5]", "14"],
    ["[]", "0"],
    ["[7]", "0"],
    ["[1,1,1]", "0"],
    ["[0,2,0]", "0"],
    ["[4,1,4]", "3"],
  ]),
};

export const ALL_TASKS: Task[] = [
  ORIGINAL,
  ...STEPS.flatMap((s) => [s.task, s.twin]),
  TRANSFER,
];

export function taskById(id: string): Task | undefined {
  return ALL_TASKS.find((t) => t.id === id);
}

export type Cell = "bar" | "water" | "air";

// The picture of bars and water, top row first, e.g. for [4, 2, 0, 3, 2, 5].
export function barCells(heights: number[]): Cell[][] {
  const top = Math.max(0, ...heights);
  const level = heights.map((_, i) =>
    Math.min(Math.max(...heights.slice(0, i + 1)), Math.max(...heights.slice(i))),
  );
  const rows: Cell[][] = [];
  for (let y = top; y >= 1; y--) {
    rows.push(heights.map((h, i) => (h >= y ? "bar" : level[i] >= y ? "water" : "air")));
  }
  return rows;
}
