/* global importScripts, loadPyodide */
// Runs the student's Python in a background thread, so an infinite loop can be
// stopped (the page terminates this worker) without freezing the tab.

importScripts("https://cdn.jsdelivr.net/pyodide/v0.26.4/full/pyodide.js");

// Each run gets a fresh namespace, then every test is evaluated in it.
const HARNESS = `
import json

def __run(payload):
    data = json.loads(payload)
    ns = {}
    try:
        exec(data["prelude"], ns)
        exec(compile(data["code"], "<your code>", "exec"), ns)
    except Exception as e:
        return json.dumps({"error": f"{type(e).__name__}: {e}", "results": []})
    results = []
    for t in data["tests"]:
        try:
            got = eval(t["call"], ns)
            ok = got == eval(t["expected"])
            results.append({**t, "got": repr(got), "pass": bool(ok)})
        except Exception as e:
            results.append({**t, "got": f"{type(e).__name__}: {e}", "pass": False})
    return json.dumps({"error": None, "results": results})
`;

const pyodideReady = loadPyodide().then((py) => {
  py.runPython(HARNESS);
  return py;
});

pyodideReady.then(
  () => postMessage({ type: "ready" }),
  (err) => postMessage({ type: "load-error", message: String(err) }),
);

onmessage = async (event) => {
  const py = await pyodideReady;
  let stdout = "";
  py.setStdout({ batched: (line) => (stdout += line + "\n") });
  py.globals.set("__payload", JSON.stringify(event.data));
  const result = JSON.parse(py.runPython("__run(__payload)"));
  postMessage({ type: "result", result: { ...result, stdout } });
};
