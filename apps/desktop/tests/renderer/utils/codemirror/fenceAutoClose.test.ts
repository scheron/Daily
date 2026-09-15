import {describe, expect, it} from "vitest"

import {keymap} from "@codemirror/view"
import {markdownKeymap} from "../../../../src/renderer/src/utils/codemirror/commands"
import {mountEditorView, pressKey, unmountEditorView} from "../../../helpers/editorView"

function mount(doc: string, cursor: number) {
  return mountEditorView(doc, {selection: {anchor: cursor}, extensions: [keymap.of(markdownKeymap)]})
}

describe("markdownKeymap closes an opened code fence on Enter", () => {
  it("closes a freshly opened fence with a language", () => {
    const view = mount("```js", 5)

    pressKey(view, {key: "Enter"})

    expect(view.state.doc.toString()).toBe("```js\n\n```")
    expect(view.state.selection.main.head).toBe(6)
    unmountEditorView(view)
  })

  it("indents the body line and the closing fence like the opening fence", () => {
    const doc = "- item\n  ```ts"
    const view = mount(doc, doc.length)

    pressKey(view, {key: "Enter"})

    expect(view.state.doc.toString()).toBe("- item\n  ```ts\n  \n  ```")
    expect(view.state.selection.main.head).toBe(doc.length + 3)
    unmountEditorView(view)
  })

  it("does nothing when a closing fence already exists below", () => {
    const doc = "```js\nconst a = 1\n```"
    const view = mount(doc, 5)

    pressKey(view, {key: "Enter"})

    expect(view.state.doc.toString()).toBe(doc)
    unmountEditorView(view)
  })

  it("opens a block only when the fence names a language", () => {
    const bareFence = mount("```", 3)
    pressKey(bareFence, {key: "Enter"})
    expect(bareFence.state.doc.toString()).toBe("```")
    unmountEditorView(bareFence)

    const plainText = mount("hello", 5)
    pressKey(plainText, {key: "Enter"})
    expect(plainText.state.doc.toString()).toBe("hello")
    unmountEditorView(plainText)
  })

  it("does nothing when the caret is not at the end of the fence line", () => {
    const view = mount("```js", 2)

    pressKey(view, {key: "Enter"})

    expect(view.state.doc.toString()).toBe("```js")
    unmountEditorView(view)
  })
})
