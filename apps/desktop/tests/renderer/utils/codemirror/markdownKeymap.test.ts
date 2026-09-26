import {describe, expect, it} from "vitest"

import {keymap} from "@codemirror/view"
import {markdownKeymap} from "../../../../src/renderer/src/utils/codemirror/commands"
import {mountEditorView, pressKey, unmountEditorView} from "../../../helpers/editorView"

const isMac = /Mac/.test(navigator.platform)

function wrapWord(key: string) {
  const view = mountEditorView("word", {selection: {anchor: 0, head: 4}, extensions: [keymap.of(markdownKeymap)]})
  pressKey(view, {key, metaKey: isMac, ctrlKey: !isMac})
  const doc = view.state.doc.toString()
  unmountEditorView(view)
  return doc
}

describe("markdownKeymap formats the selection on the chords the shortcuts list shows", () => {
  it("bolds on Mod-B", () => {
    expect(wrapWord("b")).toBe("**word**")
  })

  it("italicises on Mod-I", () => {
    expect(wrapWord("i")).toBe("*word*")
  })

  it("wraps inline code on Mod-backtick", () => {
    expect(wrapWord("`")).toBe("`word`")
  })
})
