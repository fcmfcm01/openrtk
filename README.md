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
npm install openrtk
```

Add to your OpenCode config (`opencode.json` or `.opencode/config.json`):

```json
{
  "plugins": ["openrtk"]
}
```

## How it works

The plugin hooks into OpenCode's `tool.execute.before` event and rewrites shell commands to go through RTK before execution. Fully transparent to the model.

```
git status       →  rtk git status       (72% savings)
cargo test       →  rtk cargo test       (90% savings)
docker ps        →  rtk docker ps        (65% savings)
```

All rewrite logic lives in `rtk rewrite` (the Rust binary's single source of truth). The plugin is a thin delegate — when new filters are added to RTK, the plugin picks them up automatically.

## Session Tracking

The plugin tracks how many commands are rewritten each session. At the end of a session, you'll see a summary:

```
[rtk] Session: 15 commands rewritten.
  git status → rtk git status
  cargo test → rtk cargo test
  ...
Run `rtk gain` for detailed token savings.
```

## Meta Commands

```bash
rtk gain              # Show token savings analytics
rtk gain --history    # Show command usage history with savings
rtk discover          # Analyze history for missed optimization opportunities
rtk session           # Show RTK adoption across recent sessions
rtk proxy <cmd>       # Execute raw command without filtering (debugging)
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
