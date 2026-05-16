// src/rewrite.ts
var {execFileSync} = (() => ({}));
var RTK_TIMEOUT_MS = 2000;
var RTK_PREFIX_RE = /^(.*\/)?rtk\s/;
function rewrite(command) {
  if (!command || RTK_PREFIX_RE.test(command))
    return null;
  try {
    const result = execFileSync("rtk", ["rewrite", command], {
      encoding: "utf-8",
      timeout: RTK_TIMEOUT_MS,
      stdio: ["pipe", "pipe", "pipe"]
    }).trim();
    return result && result !== command ? result : null;
  } catch (e) {
    if (e.status === 0 || e.status === 3) {
      const result = e.stdout?.trim();
      return result && result !== command ? result : null;
    }
    return null;
  }
}

// src/tracker.ts
class Tracker {
  count = 0;
  examples = [];
  record(original, rewritten) {
    if (rewritten) {
      this.count++;
      if (this.examples.length < 5) {
        this.examples.push({ original, rewritten });
      }
    }
  }
  get count() {
    return this.count;
  }
  summary() {
    if (this.count === 0)
      return "[rtk] No commands rewritten this session.";
    const lines = [`[rtk] Session: ${this.count} commands rewritten.`];
    for (const ex of this.examples.slice(0, 3)) {
      lines.push(`  ${ex.original} → ${ex.rewritten}`);
    }
    lines.push("Run `rtk gain` for detailed token savings.");
    return lines.join(`
`);
  }
  reset() {
    this.count = 0;
    this.examples = [];
  }
}

// src/index.ts
var rtkAvailable = null;
function checkRtk($) {
  if (rtkAvailable !== null)
    return rtkAvailable;
  try {
    $`which rtk`.quiet();
    rtkAvailable = true;
  } catch {
    rtkAvailable = false;
  }
  return rtkAvailable;
}
function _resetRtkCheck() {
  rtkAvailable = null;
}
async function createRtkPlugin({ $ }) {
  if (!checkRtk($)) {
    console.warn("[openrtk] rtk binary not found in PATH — plugin disabled");
    return {};
  }
  const tracker = new Tracker;
  return {
    "tool.execute.before": async (input, output) => {
      const tool = String(input?.tool ?? "").toLowerCase();
      if (tool !== "bash" && tool !== "shell")
        return;
      const args = output?.args;
      if (!args || typeof args !== "object")
        return;
      const command = args.command;
      if (typeof command !== "string" || !command)
        return;
      const rewritten = rewrite(command);
      if (rewritten) {
        args.command = rewritten;
        tracker.record(command, rewritten);
      }
    },
    "tool.execute.after": async () => {}
  };
}
var rtkPlugin = async (input) => {
  const hooks = await createRtkPlugin(input);
  return hooks;
};
var openrtkPluginModule = {
  id: "openrtk",
  server: rtkPlugin
};
var src_default = openrtkPluginModule;
export {
  openrtkPluginModule,
  src_default as default,
  _resetRtkCheck
};
