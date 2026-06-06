// @ts-nocheck
import {describe, expect, it} from "vitest"

import {ThinkBlockSplitter} from "@main/ai/clients/common/streaming/thinkBlockSplitter"

type Emit = ["content" | "reasoning", string]

function record(): {emit: (k: "content" | "reasoning", t: string) => void; out: Emit[]} {
  const out: Emit[] = []
  return {emit: (k, t) => out.push([k, t]), out}
}

describe("ThinkBlockSplitter", () => {
  it("emits plain content when no tags", () => {
    const s = new ThinkBlockSplitter()
    const {emit, out} = record()
    s.push("hello world", emit)
    s.flush(emit)
    expect(out).toEqual([["content", "hello world"]])
  })

  it("splits a complete <think> block in one push", () => {
    const s = new ThinkBlockSplitter()
    const {emit, out} = record()
    s.push("hi <think>let me check</think>done", emit)
    s.flush(emit)
    expect(out).toEqual([
      ["content", "hi "],
      ["reasoning", "let me check"],
      ["content", "done"],
    ])
  })

  it("handles opening tag split across pushes", () => {
    const s = new ThinkBlockSplitter()
    const {emit, out} = record()
    s.push("hi <thi", emit)
    s.push("nk>thinking</think>ok", emit)
    s.flush(emit)
    expect(out).toEqual([
      ["content", "hi "],
      ["reasoning", "thinking"],
      ["content", "ok"],
    ])
  })

  it("handles closing tag split across pushes", () => {
    const s = new ThinkBlockSplitter()
    const {emit, out} = record()
    s.push("<think>part one</thi", emit)
    s.push("nk>after", emit)
    s.flush(emit)
    expect(out).toEqual([
      ["reasoning", "part one"],
      ["content", "after"],
    ])
  })

  it("handles every possible split point on opening tag", () => {
    for (const cut of [1, 2, 3, 4, 5, 6]) {
      const s = new ThinkBlockSplitter()
      const {emit, out} = record()
      const tag = "<think>"
      s.push(tag.slice(0, cut), emit)
      s.push(tag.slice(cut) + "X</think>Y", emit)
      s.flush(emit)
      expect(out).toEqual([
        ["reasoning", "X"],
        ["content", "Y"],
      ])
    }
  })

  it("treats lone '<' as content when followed by non-tag chars", () => {
    const s = new ThinkBlockSplitter()
    const {emit, out} = record()
    s.push("a < b is true", emit)
    s.flush(emit)
    expect(out.map((p) => p[1]).join("")).toBe("a < b is true")
    expect(out.every((p) => p[0] === "content")).toBe(true)
  })

  it("emits multiple consecutive think blocks", () => {
    const s = new ThinkBlockSplitter()
    const {emit, out} = record()
    s.push("<think>A</think>B<think>C</think>D", emit)
    s.flush(emit)
    expect(out).toEqual([
      ["reasoning", "A"],
      ["content", "B"],
      ["reasoning", "C"],
      ["content", "D"],
    ])
  })

  it("flushes unclosed think block as reasoning", () => {
    const s = new ThinkBlockSplitter()
    const {emit, out} = record()
    s.push("<think>thinking but cut off", emit)
    s.flush(emit)
    expect(out).toEqual([["reasoning", "thinking but cut off"]])
  })

  it("handles empty think block", () => {
    const s = new ThinkBlockSplitter()
    const {emit, out} = record()
    s.push("a<think></think>b", emit)
    s.flush(emit)
    expect(out.filter((p) => p[1] !== "")).toEqual([
      ["content", "a"],
      ["content", "b"],
    ])
  })

  it("emits no events on empty push", () => {
    const s = new ThinkBlockSplitter()
    const {emit, out} = record()
    s.push("", emit)
    s.flush(emit)
    expect(out).toEqual([])
  })
})
