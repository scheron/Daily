import {describe, expect, it} from "vitest"

import {inlineCommands} from "../../../../src/renderer/src/utils/codemirror/commands"
import {mountEditorView, unmountEditorView} from "../../../helpers/editorView"

function clear(doc: string, from: number, to: number) {
  const view = mountEditorView(doc, {selection: {anchor: from, head: to}})
  const isApplied = inlineCommands.clearFormatting(view)
  const result = {
    doc: view.state.doc.toString(),
    selection: [view.state.selection.main.from, view.state.selection.main.to] as [number, number],
    isApplied,
  }
  unmountEditorView(view)
  return result
}

describe("inlineCommands.clearFormatting", () => {
  it("peels the markers wrapping the selection, layer by layer", () => {
    expect(clear("*hello*", 1, 6)).toEqual({doc: "hello", selection: [0, 5], isApplied: true})
    expect(clear("**hello**", 2, 7)).toEqual({doc: "hello", selection: [0, 5], isApplied: true})
    expect(clear("`code`", 1, 5)).toEqual({doc: "code", selection: [0, 4], isApplied: true})
    expect(clear("~~gone~~", 2, 6)).toEqual({doc: "gone", selection: [0, 4], isApplied: true})
    expect(clear("***hello***", 3, 8)).toEqual({doc: "hello", selection: [0, 5], isApplied: true})
    expect(clear("a *hello* b", 3, 8)).toEqual({doc: "a hello b", selection: [2, 7], isApplied: true})
  })

  it("strips inline markdown inside the selection", () => {
    expect(clear("*hello*", 0, 7)).toEqual({doc: "hello", selection: [0, 5], isApplied: true})
  })

  it("leaves text without formatting unchanged", () => {
    expect(clear("hello", 0, 5)).toEqual({doc: "hello", selection: [0, 5], isApplied: false})
  })
})
