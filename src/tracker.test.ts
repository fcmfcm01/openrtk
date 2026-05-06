import { describe, expect, test } from "bun:test"
import { Tracker } from "./tracker"

describe("Tracker", () => {
  test("new tracker starts at zero", () => {
    const tracker = new Tracker()
    expect(tracker.count).toBe(0)
  })

  test("record a rewrite", () => {
    const tracker = new Tracker()
    tracker.record("git status", "rtk git status")
    expect(tracker.count).toBe(1)
  })

  test("record null (no rewrite)", () => {
    const tracker = new Tracker()
    tracker.record("echo hello", null)
    expect(tracker.count).toBe(0)
  })

  test("summary with rewrites", () => {
    const tracker = new Tracker()
    tracker.record("git status", "rtk git status")
    tracker.record("cargo build", "rtk cargo build")
    tracker.record("echo hello", null)
    const s = tracker.summary()
    expect(s).toContain("2 commands rewritten")
    expect(s).toContain("git status")
    expect(s).toContain("rtk gain")
  })

  test("reset clears state", () => {
    const tracker = new Tracker()
    tracker.record("git status", "rtk git status")
    tracker.reset()
    expect(tracker.count).toBe(0)
  })
})
