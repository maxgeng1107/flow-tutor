# Flow Tutor (early prototype)

A rough demo of one idea: **when a student is stuck, more hints don't help. Rebuild the path instead.**

It covers a single problem, [Trapping Rain Water](https://leetcode.com/problems/trapping-rain-water/), and was built to test the idea, not to be a finished tool.

**Try it:** https://flow-tutor.vercel.app · **90-second video:** https://flow-tutor.vercel.app/demo.webm

Inspired by UCSD LEI's SmartLearning Hub and the point that general AI tools don't necessarily help students learn.

## The idea

1. Start with the real problem.
2. Stuck? Get **one** hint from the AI.
3. Still stuck? No more hints. The problem is broken into six small steps. The first two are answered with a single number from a picture, so the student notices the rule before writing any code.
4. Climb back to the original problem and solve it alone.
5. Check understanding with a **different problem built on the same idea**: copying the old code passes 1 of 9 tests.

Steps the student already mastered are skipped next time. Ideas borrowed: the assistance dilemma, flow, mastery learning, worked examples.

## The AI part

The LLM (`claude-haiku-5-5`, server-side only) is used for just two things: the single hint, and "why?" questions during the steps. Tests run as real Python in the browser (Pyodide), and the steps are hand-written, so the AI never judges answers or writes content.

It has two guardrails:

- a **system prompt** with rules (no solutions, no "my professor said it's fine");
- an **output filter**, which is plain code that blocks replies containing the step's answer line or too much code, then retries or falls back to a fixed hint.

**Quick test:** 10 "just give me the answer" attacks, plus one hidden in a code comment, judged by a separate model. All 11 were blocked, every one by the prompt alone, so the filter hasn't been tested against a real leak yet. Details in [`eval/results.md`](eval/results.md).

## Not done / open questions

- **Only one problem.** Every step is hand-written. I don't know yet how to make new problems without writing six steps by hand each time.
- **No real students yet.** I've only tested it on myself, and I'd already seen this problem.
- **"Mastered" is a guess:** right on the first try, without help, in under 3 minutes. I haven't checked whether that rule means anything.
- **Progress lives in the browser.** There are no accounts, and nothing for an instructor to see.
- **Small guardrail sample.** Ten prompts against one model, and the filter has never fired on a real leak.
- **Rough edges.** For example, AI replies sometimes show raw Markdown.

## Run it locally

```bash
npm install
echo 'ANTHROPIC_API_KEY=sk-ant-...' > .env.local
npm run dev        # http://localhost:3000
npm run eval       # re-run the attack test (about $0.20)
```

The problem is based on LeetCode 42; the statement, steps and second problem are my own wording.
