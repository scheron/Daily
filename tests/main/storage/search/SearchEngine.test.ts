// @ts-nocheck
import {beforeEach, describe, expect, it} from "vitest"

import {SearchEngine} from "@main/storage/search/SearchEngine"

function makeSearchTask(overrides = {}) {
  return {
    id: overrides.id ?? "task-1",
    content: overrides.content ?? "Test content",
    plainText: (overrides.content ?? "test content").toLowerCase(),
    updatedAt: overrides.updatedAt ?? "2026-03-24T00:00:00.000Z",
    date: overrides.date ?? "2026-03-24",
  }
}

describe("SearchEngine", () => {
  let engine

  beforeEach(() => {
    engine = new SearchEngine()
  })

  it("finds exact substring match", () => {
    engine.buildIndex([makeSearchTask({id: "1", content: "Buy groceries"}), makeSearchTask({id: "2", content: "Write code"})])

    const results = engine.search("groceries")

    expect(results).toHaveLength(1)
    expect(results[0].task.id).toBe("1")
  })

  it("finds fuzzy match with 1-2 character errors", () => {
    engine.buildIndex([makeSearchTask({id: "1", content: "Implementation details"})])

    // "implmentation" — missing 'e', should still match for long enough query
    const results = engine.search("implmentation")

    expect(results).toHaveLength(1)
  })

  it("returns empty results for empty query", () => {
    engine.buildIndex([makeSearchTask()])

    expect(engine.search("")).toEqual([])
    expect(engine.search("   ")).toEqual([])
  })

  it("ranks exact matches higher than fuzzy matches", () => {
    engine.buildIndex([
      makeSearchTask({id: "fuzzy", content: "implementaton details"}), // typo in content
      makeSearchTask({id: "exact", content: "implementation details"}),
    ])

    const results = engine.search("implementation")

    expect(results[0].task.id).toBe("exact")
  })

  it("search is case-insensitive", () => {
    engine.buildIndex([makeSearchTask({id: "1", content: "Hello World"})])

    expect(engine.search("hello world")).toHaveLength(1)
    expect(engine.search("HELLO")).toHaveLength(1)
  })

  it("respects limit option", () => {
    const tasks = Array.from({length: 10}, (_, i) => makeSearchTask({id: `${i}`, content: `Task number ${i}`}))
    engine.buildIndex(tasks)

    const results = engine.search("Task", {limit: 3})

    expect(results).toHaveLength(3)
  })

  it("adding and removing tasks updates index", () => {
    engine.buildIndex([makeSearchTask({id: "1", content: "First task"})])

    engine.addTask(makeSearchTask({id: "2", content: "Second task"}))
    expect(engine.search("Second")).toHaveLength(1)

    engine.removeTask("2")
    expect(engine.search("Second")).toHaveLength(0)
  })
})
