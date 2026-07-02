import {describe, expect, it} from "vitest"

import {planClearFormatting} from "@/utils/codemirror/commands/inlineCommands"

import {EditorState} from "@codemirror/state"

function clear(doc: string, from: number, to: number) {
  const state = EditorState.create({doc, selection: {anchor: from, head: to}})
  const plan = planClearFormatting(state)
  if (!plan) return {doc, sel: null as [number, number] | null}
  const next = state.update({changes: plan.changes, selection: {anchor: plan.anchor, head: plan.head}}).state
  return {doc: next.doc.toString(), sel: [next.selection.main.from, next.selection.main.to] as [number, number]}
}

describe("planClearFormatting", () => {
  it("strips wrapping markers when only the inner word is selected", () => {
    expect(clear("*hello*", 1, 6)).toEqual({doc: "hello", sel: [0, 5]}) // italic
    expect(clear("**hello**", 2, 7)).toEqual({doc: "hello", sel: [0, 5]}) // bold
    expect(clear("`code`", 1, 5)).toEqual({doc: "code", sel: [0, 4]}) // code
    expect(clear("~~gone~~", 2, 6)).toEqual({doc: "gone", sel: [0, 4]}) // strike
  })

  it("peels nested wrapping markers layer by layer", () => {
    expect(clear("***hello***", 3, 8)).toEqual({doc: "hello", sel: [0, 5]})
  })

  it("still clears markers inside a full selection", () => {
    expect(clear("*hello*", 0, 7)).toEqual({doc: "hello", sel: [0, 5]})
  })

  it("preserves surrounding text outside the markers", () => {
    expect(clear("a *hello* b", 3, 8)).toEqual({doc: "a hello b", sel: [2, 7]})
  })

  it("does nothing when there is no formatting to clear", () => {
    expect(clear("hello", 0, 5)).toEqual({doc: "hello", sel: null})
  })
})
