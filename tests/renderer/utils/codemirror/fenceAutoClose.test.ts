import {describe, expect, it} from "vitest"

import {planFenceAutoClose} from "@/utils/codemirror/commands/codeBlock"

import {EditorState} from "@codemirror/state"

const state = (doc: string, cursor: number) => EditorState.create({doc, selection: {anchor: cursor}})

describe("planFenceAutoClose", () => {
  it("closes a freshly opened fence with a language", () => {
    expect(planFenceAutoClose(state("```js", 5))).toEqual({insert: "\n\n```", anchor: 6})
  })

  it("preserves indentation of the opening fence", () => {
    const doc = "  ```ts"
    expect(planFenceAutoClose(state(doc, doc.length))).toEqual({insert: "\n\n  ```", anchor: doc.length + 1})
  })

  it("does nothing when a closing fence already exists below", () => {
    const doc = "```js\nconst a = 1\n```"
    expect(planFenceAutoClose(state(doc, 5))).toBeNull()
  })

  it("does nothing for a bare fence (no language) — could be a closing fence", () => {
    expect(planFenceAutoClose(state("```", 3))).toBeNull()
  })

  it("does nothing when the caret is not at the end of the fence line", () => {
    expect(planFenceAutoClose(state("```js", 2))).toBeNull()
  })

  it("does nothing on a normal text line", () => {
    expect(planFenceAutoClose(state("hello", 5))).toBeNull()
  })
})
