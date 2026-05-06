export class Tracker {
  private count = 0
  private examples: Array<{ original: string; rewritten: string }> = []

  record(original: string, rewritten: string | null): void {
    if (rewritten) {
      this.count++
      if (this.examples.length < 5) {
        this.examples.push({ original, rewritten })
      }
    }
  }

  get count(): number {
    return this.count
  }

  summary(): string {
    if (this.count === 0) return "[rtk] No commands rewritten this session."
    const lines = [`[rtk] Session: ${this.count} commands rewritten.`]
    for (const ex of this.examples.slice(0, 3)) {
      lines.push(`  ${ex.original} → ${ex.rewritten}`)
    }
    lines.push("Run `rtk gain` for detailed token savings.")
    return lines.join("\n")
  }

  reset(): void {
    this.count = 0
    this.examples = []
  }
}
