# RTK - Rust Token Killer

Token-optimized CLI proxy (60-90% savings on dev operations). Shell commands are automatically rewritten through RTK by the openrtk plugin.

## How It Works

All shell commands are transparently rewritten through RTK. No manual prefixing needed.

```
git status       →  rtk git status       (72% savings)
cargo test       →  rtk cargo test       (90% savings)
docker ps        →  rtk docker ps        (65% savings)
```

Note: Built-in tools (Read, Grep, Glob) bypass the hook. Use shell equivalents (`cat`, `rg`, `find`) for RTK-filtered output.

## Meta Commands (use directly)

```bash
rtk gain              # Show token savings analytics
rtk gain --history    # Show command usage history with savings
rtk gain --graph      # ASCII graph (last 30 days)
rtk discover          # Analyze history for missed optimization opportunities
rtk session           # Show RTK adoption across recent sessions
rtk proxy <cmd>       # Execute raw command without filtering (debugging)
```

## Supported Commands

| Category | Commands |
|----------|----------|
| Git | status, diff, log, add, commit, push, pull, branch, fetch, stash, show |
| GitHub CLI | pr, issue, run, api, release |
| Rust | cargo test/build/clippy/check/fmt |
| File ops | cat (→ rtk read), grep/rg (→ rtk grep), ls, tree, find |
| JS/TS | vitest, npm test/run, tsc, eslint, prettier, playwright, prisma |
| Python | pytest, ruff, pip |
| Go | go test/build/vet, golangci-lint |
| Containers | docker (ps/images/logs/compose), kubectl (pods/logs/services) |
| AWS | sts, ec2, lambda, s3, cloudformation, dynamodb, logs, iam |
| Network | curl, wget |
