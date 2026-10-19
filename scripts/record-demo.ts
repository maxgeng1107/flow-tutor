// Records the demo video by driving the live site in Chrome, with captions.
//
//   npm run record-demo
//
// Writes demo-video/flow-tutor-demo.webm. Uses your installed Google Chrome;
// the only download is Playwright's small ffmpeg (npx playwright install ffmpeg).
// It calls the live API twice (one hint, one "why?" question): a fraction of a cent.

import { chromium, type Page } from "playwright";
import { mkdirSync, renameSync, rmSync } from "node:fs";

const SITE = process.env.DEMO_URL ?? "https://flow-tutor.vercel.app";
const OUT_DIR = "demo-video";
// The page is laid out at 1504x1060 and the video scaled to 1280 wide, so
// everything (results included) fits above the caption bar.
const VIEWPORT = { width: 1504, height: 1060 };
const VIDEO = { width: 1280, height: 902 };

const STEP_CODE = {
  s4: `def prefix_max(a):
    out = []
    best = 0
    for x in a:
        best = max(best, x)
        out.append(best)
    return out
`,
  s5: `def suffix_max(a):
    out = [0] * len(a)
    best = 0
    for i in range(len(a) - 1, -1, -1):
        best = max(best, a[i])
        out[i] = best
    return out
`,
  s6: `def trap(heights):
    left = prefix_max(heights)
    right = suffix_max(heights)
    total = 0
    for i in range(len(heights)):
        total += water_at(left[i], right[i], heights[i])
    return total
`,
  original: `def trap(heights):
    n = len(heights)
    left, right = [0] * n, [0] * n
    for i in range(n):
        left[i] = max(heights[i], left[i - 1] if i else 0)
    for i in range(n - 1, -1, -1):
        right[i] = max(heights[i], right[i + 1] if i < n - 1 else 0)
    return sum(min(left[i], right[i]) - heights[i] for i in range(n))
`,
};

// A caption bar drawn on top of the page, so the video explains itself.
async function caption(page: Page, text: string) {
  await page.evaluate((t) => {
    let el = document.getElementById("demo-caption");
    if (!el) {
      el = document.createElement("div");
      el.id = "demo-caption";
      // A full-width bar along the bottom edge, below the page content.
      Object.assign(el.style, {
        position: "fixed",
        left: "0",
        right: "0",
        bottom: "0",
        padding: "18px 48px",
        background: "rgba(15, 23, 42, 0.94)",
        color: "#fff",
        font: "500 25px/1.4 system-ui, -apple-system, sans-serif",
        textAlign: "center",
        zIndex: "9999",
        pointerEvents: "none",
      });
      document.body.appendChild(el);
    }
    el.textContent = t;
  }, text);
}

const button = (page: Page, name: string | RegExp) => page.getByRole("button", { name });

async function answer(page: Page, value: string) {
  const box = page.getByLabel("Your answer");
  await box.pressSequentially(value, { delay: 180 });
  await page.waitForTimeout(400);
  await box.press("Enter");
}

async function next(page: Page, pauseOnRule = 1500) {
  await button(page, /^Next →/).click();
  await page.waitForTimeout(pauseOnRule);
  await button(page, /^Continue/).click();
  await page.waitForTimeout(800);
}

async function runAndPass(page: Page, code: string) {
  await page.getByLabel("Your code").fill(code);
  await page.waitForTimeout(700);
  await button(page, "Run tests").click();
  await button(page, /^Next/).waitFor({ timeout: 30_000 });
}

async function record(page: Page) {
  const wait = (ms: number) => page.waitForTimeout(ms);

  await page.goto(`${SITE}/?reset`);
  await button(page, "Run tests").waitFor();
  await caption(page, "Flow Tutor: a tutor for one hard problem, Trapping Rain Water.");
  await wait(3000);

  await caption(page, "The student starts with the real problem. Tests run as real Python, in the browser.");
  await button(page, "Run tests").click();
  await page.getByText(/tests passed/).waitFor({ timeout: 60_000 });
  await wait(2500);

  await caption(page, "Stuck? They get exactly one hint, written about their own code.");
  await button(page, "I'm stuck").click();
  await page.getByText("Your one hint").waitFor({ timeout: 60_000 });
  await wait(4500);

  await caption(page, "Still stuck? No more hints. The problem is rebuilt as small steps.");
  await button(page, "I'm stuck").click();
  await wait(2500);

  await caption(page, "Step 1 starts from a picture, not a formula: how much water sits on this bar?");
  await wait(3000);
  await answer(page, "2");
  await caption(page, "The water appears, with a question to think about first…");
  await wait(3000);
  await button(page, /^Next →/).click();
  await caption(page, "…then the rule this step was teaching.");
  await wait(3500);
  await button(page, /^Continue/).click();
  await wait(1000);

  await caption(page, "Step 2: the walls are far away. Two wrong answers…");
  await wait(2000);
  await answer(page, "0");
  await wait(1200);
  await answer(page, "3");
  await wait(800);
  await caption(page, "…so it shows the answer for this step only.");
  await wait(4000);
  await button(page, "Try one more like it").click();
  await caption(page, "Then one more like it, on their own.");
  await wait(1500);
  await answer(page, "1");
  await wait(1200);
  await next(page);

  await caption(page, "Step 3: write the rule you just found. You can ask why, but it won't give the answer.");
  await wait(2500);
  const ask = page.getByPlaceholder("Ask why…");
  await ask.pressSequentially("Just give me the answer.", { delay: 45 });
  await ask.press("Enter");
  await page.getByText("Thinking…").waitFor();
  await page.getByText("Thinking…").waitFor({ state: "hidden", timeout: 60_000 });
  await wait(3500);
  await caption(page, "Two guardrails: a system prompt plus a code filter. 10 of 10 attacks blocked in testing.");
  await wait(4000);

  await caption(page, "The editor auto-indents, so writing Python feels normal.");
  const editor = page.getByLabel("Your code");
  await editor.fill("");
  await editor.pressSequentially("def water_at(left_max, right_max, h):", { delay: 35 });
  await editor.press("Enter");
  await editor.pressSequentially("return min(left_max, right_max) - h", { delay: 35 });
  await wait(800);
  await button(page, "Run tests").click();
  await button(page, /^Next/).waitFor({ timeout: 30_000 });
  await wait(2000);
  await next(page, 2500);

  await caption(page, "Steps 4–6: tallest from the left, from the right, then put it together.");
  for (const code of [STEP_CODE.s4, STEP_CODE.s5, STEP_CODE.s6]) {
    await runAndPass(page, code);
    await wait(1200);
    await next(page, 1200);
  }

  await caption(page, "Back to the original problem, with nothing on screen to help.");
  await wait(2500);
  await runAndPass(page, STEP_CODE.original);
  await wait(2500);

  await caption(page, "Last check: a new problem with the same idea. Copying the old code fails 8 of 9 tests.");
  await button(page, /new problem/).click();
  await wait(5000);

  await caption(page, "flow-tutor.vercel.app  ·  github.com/maxgeng1107/flow-tutor");
  await wait(4000);
}

async function main() {
  rmSync(OUT_DIR, { recursive: true, force: true });
  mkdirSync(OUT_DIR, { recursive: true });

  const browser = await chromium.launch({ channel: "chrome" });
  const context = await browser.newContext({
    viewport: VIEWPORT,
    colorScheme: "light",
    recordVideo: { dir: OUT_DIR, size: VIDEO },
  });
  const page = await context.newPage();
  try {
    await record(page);
  } finally {
    const video = page.video();
    await context.close(); // the video file is finished when the context closes
    await browser.close();
    if (video) {
      const target = `${OUT_DIR}/flow-tutor-demo.webm`;
      renameSync(await video.path(), target);
      console.log(`Saved ${target}`);
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
