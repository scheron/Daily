// @ts-nocheck
import {readFileSync} from "node:fs"
import {dirname, join, resolve} from "node:path"
import {describe, expect, it} from "vitest"

const ROOT = join(__dirname, "..")

function resolveImport(spec, fromFile) {
  let base
  if (spec.startsWith(".")) base = resolve(dirname(fromFile), spec)
  else return null // bare dependency — not a project file
  for (const cand of [base + ".ts", join(base, "index.ts")]) {
    try {
      readFileSync(cand)
      return cand
    } catch {}
  }
  return null
}

function collectGraph(entry) {
  const seen = new Set()
  const stack = [entry]
  const electronImporters = []
  while (stack.length) {
    const file = stack.pop()
    if (seen.has(file)) continue
    seen.add(file)
    const src = readFileSync(file, "utf8")
    const specs = [...src.matchAll(/from ["']([^"']+)["']/g)].map((m) => m[1])
    for (const spec of specs) {
      if (spec === "electron") electronImporters.push(file)
      const next = resolveImport(spec, file)
      if (next) stack.push(next)
    }
  }
  return {seen, electronImporters}
}

describe("CLI import graph is electron-free", () => {
  it("nothing reachable from src/index.ts imports electron", () => {
    const {electronImporters} = collectGraph(join(ROOT, "src/index.ts"))
    expect(electronImporters).toEqual([])
  })
})
