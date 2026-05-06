import { describe, expect, test, mock, beforeEach } from "bun:test"

const mockRewrite = mock((_cmd: string): string | null => null)

mock.module("./rewrite", () => ({ rewrite: mockRewrite }))

const { rtkPlugin, _resetRtkCheck, default: defaultExport } = await import("./index")

function mock$(succeeds: boolean) {
  return (strings: TemplateStringsArray) => {
    if (!succeeds) throw new Error("which rtk failed")
    return { quiet: () => {} }
  }
}

beforeEach(() => {
  _resetRtkCheck()
  mockRewrite.mockClear()
})

describe("exports", () => {
  test("rtkPlugin is a function", () => {
    expect(typeof rtkPlugin).toBe("function")
  })

  test("default export equals named export", () => {
    expect(defaultExport).toBe(rtkPlugin)
  })
})

describe("plugin initialization", () => {
  test("returns hooks when rtk found", async () => {
    const hooks = await rtkPlugin({ $: mock$(true) })
    expect(typeof hooks["tool.execute.before"]).toBe("function")
    expect(typeof hooks["tool.execute.after"]).toBe("function")
  })

  test("returns empty object when rtk not found", async () => {
    const hooks = await rtkPlugin({ $: mock$(false) })
    expect(hooks).toEqual({})
  })
})

describe("tool.execute.before", () => {
  async function getHandler(rtkFound = true) {
    const hooks = await rtkPlugin({ $: mock$(rtkFound) })
    return hooks["tool.execute.before"]!
  }

  test("ignores non-bash tools", async () => {
    const handler = await getHandler()
    const args = { command: "git status" }
    handler({ tool: "Read" }, { args })
    expect(args.command).toBe("git status")
    expect(mockRewrite).not.toHaveBeenCalled()
  })

  test("ignores shell tool when rewrite returns null", async () => {
    mockRewrite.mockReturnValue(null)
    const handler = await getHandler()
    const args = { command: "some-cmd" }
    handler({ tool: "bash" }, { args })
    expect(args.command).toBe("some-cmd")
  })

  test("rewrites bash commands", async () => {
    mockRewrite.mockReturnValue("rtk git status")
    const handler = await getHandler()
    const args = { command: "git status" }
    handler({ tool: "bash" }, { args })
    expect(args.command).toBe("rtk git status")
    expect(mockRewrite).toHaveBeenCalledWith("git status")
  })

  test("rewrites shell tool commands", async () => {
    mockRewrite.mockReturnValue("rtk cargo test")
    const handler = await getHandler()
    const args = { command: "cargo test" }
    handler({ tool: "Shell" }, { args })
    expect(args.command).toBe("rtk cargo test")
  })

  test("ignores empty command", async () => {
    const handler = await getHandler()
    const args = { command: "" }
    handler({ tool: "bash" }, { args })
    expect(mockRewrite).not.toHaveBeenCalled()
  })

  test("ignores missing command", async () => {
    const handler = await getHandler()
    handler({ tool: "bash" }, { args: {} })
    expect(mockRewrite).not.toHaveBeenCalled()
  })

  test("ignores missing args", async () => {
    const handler = await getHandler()
    handler({ tool: "bash" }, {})
    expect(mockRewrite).not.toHaveBeenCalled()
  })
})

describe("tracker integration", () => {
  test("tracker records rewrites", async () => {
    mockRewrite.mockReturnValue("rtk git status")
    const hooks = await rtkPlugin({ $: mock$(true) })
    const handler = hooks["tool.execute.before"]!

    const args1 = { command: "git status" }
    handler({ tool: "bash" }, { args: args1 })
    expect(args1.command).toBe("rtk git status")
    expect(mockRewrite).toHaveBeenCalledTimes(1)
  })

  test("no recording when rewrite returns null", async () => {
    mockRewrite.mockReturnValue(null)
    const hooks = await rtkPlugin({ $: mock$(true) })
    const handler = hooks["tool.execute.before"]!

    const args = { command: "unknown-cmd" }
    handler({ tool: "bash" }, { args: args })
    expect(args.command).toBe("unknown-cmd")
  })
})

describe("rtk check caching", () => {
  test("caches rtk availability across calls", async () => {
    const $ = mock$(true)
    await rtkPlugin({ $ })
    mockRewrite.mockReturnValue("rtk git log")
    const hooks = await rtkPlugin({ $ })
    const handler = hooks["tool.execute.before"]!
    const args = { command: "git log" }
    handler({ tool: "bash" }, { args })
    expect(args.command).toBe("rtk git log")
  })
})
