import { describe, expect, test, mock, beforeEach } from "bun:test"

const mockExecFileSync = mock(() => "")

mock.module("node:child_process", () => ({
  execFileSync: mockExecFileSync,
}))

const { rewrite } = await import("./rewrite")

beforeEach(() => {
  mockExecFileSync.mockClear()
})

describe("rewrite", () => {
  test("successful rewrite", () => {
    mockExecFileSync.mockReturnValue("rtk git status")
    expect(rewrite("git status")).toBe("rtk git status")
  })

  test("no rtk equivalent (exit code 1)", () => {
    mockExecFileSync.mockImplementation(() => {
      throw new Error("exit code 1")
    })
    expect(rewrite("some-unknown-command")).toBeNull()
  })

  test("already-rtk guard", () => {
    expect(rewrite("rtk git status")).toBeNull()
    expect(mockExecFileSync).not.toHaveBeenCalled()
  })

  test("empty command", () => {
    expect(rewrite("")).toBeNull()
    expect(mockExecFileSync).not.toHaveBeenCalled()
  })

  test("subprocess error returns null", () => {
    mockExecFileSync.mockImplementation(() => {
      throw new Error("spawn failed")
    })
    expect(rewrite("git status")).toBeNull()
  })

  test("result identical to input returns null", () => {
    mockExecFileSync.mockReturnValue("git status")
    expect(rewrite("git status")).toBeNull()
  })
})
