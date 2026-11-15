// @ts-nocheck
import {beforeEach, describe, expect, it} from "vitest"

import {normalize} from "@daily/std"

import {SearchEngine} from "@core/storage/search/SearchEngine"

function makeSearchTask(overrides = {}) {
  return {
    id: overrides.id ?? "task-1",
    content: overrides.content ?? "Test content",
    plainText: normalize(overrides.content ?? "test content"),
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
      makeSearchTask({id: "fuzzy", content: "implementaton details"}),
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

  it("preserves overlapping exact highlights and ranking scores", () => {
    engine.buildIndex([makeSearchTask({content: "aAaA"})])

    expect(engine.search(" Aa ")[0]).toMatchObject({
      score: 10 / 3,
      matches: [
        {
          indices: [
            [0, 1],
            [1, 2],
            [2, 3],
          ],
          value: " Aa ",
          key: "content",
        },
      ],
    })
  })

  it("ranks an exact Markdown-normalized match without raw highlight positions", () => {
    engine.buildIndex([makeSearchTask({content: "**Travel** docs"}), makeSearchTask({id: "fuzzy", content: "Travel dcs"})])

    const [first, second] = engine.search("travel docs")

    expect(first.task.id).toBe("task-1")
    expect(first.score).toBe(10)
    expect(first.matches).toBeUndefined()
    expect(second.task.id).toBe("fuzzy")
  })

  it("uses the earliest start when fuzzy windows tie on edit distance", () => {
    engine.buildIndex([makeSearchTask({content: "abcx zz abcx"})])

    expect(engine.search("abcd")[0].score).toBe(212.5)
  })

  it("uses UTF-16 code units for edit distance and match positions", () => {
    engine.buildIndex([makeSearchTask({content: "😀xcd"}), makeSearchTask({id: "two edits", content: "😀xøße"})])

    const results = engine.search("xcde")

    expect(results.map(({task}) => task.id)).toEqual(["task-1"])
    expect(results[0].score).toBe(252.5)
    expect(engine.search("😀xa")[0].score).toBe(212.5)
  })

  it("respects limit option", () => {
    const tasks = Array.from({length: 10}, (_, i) => makeSearchTask({id: `${i}`, content: `Task number ${i}`}))
    engine.buildIndex(tasks)

    const results = engine.search("Task", {limit: 3})

    expect(results).toHaveLength(3)
  })

  it("updating the index with a new task makes it searchable until removed", () => {
    engine.buildIndex([makeSearchTask({id: "1", content: "First task"})])

    engine.updateTask(makeSearchTask({id: "2", content: "Second task"}))
    expect(engine.search("Second")).toHaveLength(1)

    engine.removeTask("2")
    expect(engine.search("Second")).toHaveLength(0)
  })
})
