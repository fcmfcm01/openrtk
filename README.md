# openrtk

OpenCode plugin for [RTK](https://github.com/rtk-ai/rtk) (Rust Token Killer). Reduces LLM token consumption by 60-90% on common dev commands by transparently routing them through RTK's output compression.

A lightweight plugin that intercepts shell commands and pipes them through RTK for automatic output compression. No changes needed to prompts or workflow.

## Prerequisites

Install RTK:

```bash
brew install rtk
# or
cargo install --git https://github.com/rtk-ai/rtk
```

Verify: `rtk --version` should print `rtk X.Y.Z`.

## Installation

Install via npm:

```bash
npm install @cafeng/openrtk
```

Add to your OpenCode config (`opencode.json` or `.opencode/config.json`):

```json
{
  "plugins": ["@cafeng/openrtk"]
}
```

## User Guide

### How It Works

The plugin hooks into OpenCode's `tool.execute.before` event. When the AI decides to run a shell command, the plugin intercepts it **before execution**, asks `rtk rewrite` whether it can be compressed, and swaps the command in-place. The AI never sees the rewrite — it just gets shorter output.

```
┌──────────────────────────────────────────────────────┐
│  OpenCode                                            │
│                                                      │
│  AI runs: "git status"                               │
│       │                                              │
│       ▼  tool.execute.before hook fires              │
│  ┌────────────────────────────────────┐              │
│  │  openrtk plugin                    │              │
│  │                                    │              │
│  │  1. tool == "bash"?     ✓          │              │
│  │  2. extract command     "git status"│              │
│  │  3. call rtk rewrite ──────────────┼──► rtk binary│
│  │  4. get back           "rtk git status"           │
│  │  5. swap args.command              │              │
│  │  6. record in tracker              │              │
│  └────────────────────────────────────┘              │
│       │                                              │
│       ▼                                              │
│  Shell runs: rtk git status (compressed output)      │
│       │                                              │
│       ▼                                              │
│  AI sees: ~200 tokens instead of ~2000                │
└──────────────────────────────────────────────────────┘
```

All rewrite logic lives in `rtk rewrite` (the Rust binary's single source of truth — [70+ patterns](https://github.com/rtk-ai/rtk#commands)). The plugin is a thin delegate. When new filters are added to RTK, the plugin picks them up automatically with zero code changes.

```
git status       →  rtk git status       (72% savings)
cargo test       →  rtk cargo test       (90% savings)
docker ps        →  rtk docker ps        (65% savings)
```

### What Gets Rewritten

Any bash/shell command that `rtk rewrite` recognizes — git, cargo, npm, docker, pytest, go, kubectl, AWS, and [many more](#supported-commands).

### What Does NOT Get Rewritten

OpenCode's built-in tools (`Read`, `Grep`, `Glob`) bypass the bash hook entirely, so they are **not** rewritten. If you want RTK compression on file operations, use the shell equivalents:

| Built-in Tool (no compression) | Shell Equivalent (with compression) |
|-------------------------------|-------------------------------------|
| `Read` tool | `cat` / `rtk read` |
| `Grep` tool | `rg` / `rtk grep` |
| `Glob` tool | `find` / `rtk find` |

Commands already prefixed with `rtk` are skipped (no double-rewriting). Unrecognized commands pass through unchanged.

### Graceful Degradation

The plugin **never blocks** a command from executing. Every error path falls back to the original command:

| Scenario | Behavior |
|----------|----------|
| rtk not installed | Plugin silently disables itself |
| `rtk rewrite` crashes | Original command runs unchanged |
| `rtk rewrite` times out (2s) | Original command runs unchanged |
| Command already has `rtk` prefix | Skipped, no double-rewrite |
| Command not in rtk registry | Passes through unchanged |

### Session Tracking

The plugin counts how many commands were rewritten during each OpenCode session:

```
[rtk] Session: 15 commands rewritten.
  git status → rtk git status
  cargo test → rtk cargo test
  docker ps → rtk docker ps
Run `rtk gain` for detailed token savings.
```

### Meta Commands

These RTK commands are useful for checking your savings:

```bash
rtk gain              # Token savings dashboard
rtk gain --history    # Per-command history with savings breakdown
rtk gain --graph      # ASCII graph (last 30 days)
rtk discover          # Find commands you forgot to optimize
rtk session           # RTK adoption across recent sessions
rtk proxy <cmd>       # Run a command raw (no filtering, for debugging)
```

## Supported Commands

| Category | Commands |
|----------|----------|
| Git | status, diff, log, add, commit, push, pull, branch, fetch, stash, show |
| GitHub CLI | pr, issue, run, api, release |
| Rust | cargo test/build/clippy/check/install/fmt |
| File ops | cat (→ rtk read), grep/rg (→ rtk grep), ls, tree, find |
| JS/TS | vitest, npm test/run, tsc, eslint, prettier, playwright, prisma |
| Containers | docker (ps/images/logs/compose), kubectl (pods/logs/services) |
| Python | pytest, ruff, pip |
| Go | go test/build/vet, golangci-lint |
| AWS | sts, ec2, lambda, s3, cloudformation, dynamodb, logs, iam |
| Network | curl, wget |

## Development

```bash
bun test     # run tests
```

## License

MIT
