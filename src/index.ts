import type { Plugin } from "@opencode-ai/plugin"
import { rewrite } from "./rewrite"
import { Tracker } from "./tracker"

let rtkAvailable: boolean | null = null

function checkRtk($: any): boolean {
  if (rtkAvailable !== null) return rtkAvailable
  try {
    $`which rtk`.quiet()
    rtkAvailable = true
  } catch {
    rtkAvailable = false
  }
  return rtkAvailable
}

export function _resetRtkCheck(): void {
  rtkAvailable = null
}

export const rtkPlugin: Plugin = async ({ $ }) => {
  if (!checkRtk($)) {
    console.warn("[openrtk] rtk binary not found in PATH — plugin disabled")
    return {}
  }

  const tracker = new Tracker()

  return {
    "tool.execute.before": (input: any, output: any) => {
      const tool = String(input?.tool ?? "").toLowerCase()
      if (tool !== "bash" && tool !== "shell") return

      const args = output?.args
      if (!args || typeof args !== "object") return

      const command = (args as Record<string, unknown>).command
      if (typeof command !== "string" || !command) return

      const rewritten = rewrite(command)
      if (rewritten) {
        ;(args as Record<string, unknown>).command = rewritten
        tracker.record(command, rewritten)
      }
    },

    "tool.execute.after": () => {},
  }
}

export default rtkPlugin
