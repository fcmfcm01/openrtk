import { execFileSync } from "node:child_process"

const RTK_TIMEOUT_MS = 2000
const RTK_PREFIX_RE = /^(.*\/)?rtk\s/

export function rewrite(command: string): string | null {
  if (!command || RTK_PREFIX_RE.test(command)) return null
  try {
    const result = execFileSync("rtk", ["rewrite", command], {
      encoding: "utf-8",
      timeout: RTK_TIMEOUT_MS,
      stdio: ["pipe", "pipe", "pipe"],
    }).trim()
    return result && result !== command ? result : null
  } catch {
    return null
  }
}
