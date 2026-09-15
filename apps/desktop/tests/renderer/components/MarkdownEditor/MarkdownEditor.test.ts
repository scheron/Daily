// @vitest-environment happy-dom
// @ts-nocheck
import {createPinia, setActivePinia} from "pinia"
import {afterEach, beforeEach, describe, expect, it, vi} from "vitest"

import {selectedCompletionIndex} from "@codemirror/autocomplete"
import {EditorView} from "@codemirror/view"
import {mount} from "@vue/test-utils"
import {mockBridgeIPC} from "../../../helpers/bridgeIPC"

function typeText(view, text) {
  for (const char of text) {
    const {from, to} = view.state.selection.main
    const insert = () => view.state.update({changes: {from, to, insert: char}, selection: {anchor: from + char.length}, userEvent: "input.type"})
    const isHandled = view.state.facet(EditorView.inputHandler).some((handler) => handler(view, from, to, char, insert))
    if (!isHandled) view.dispatch(insert())
  }
}

function pressKey(view, init) {
  view.contentDOM.dispatchEvent(new KeyboardEvent("keydown", {bubbles: true, cancelable: true, ...init}))
}

describe("MarkdownEditor", () => {
  let wrapper = null

  beforeEach(() => {
    mockBridgeIPC()
    setActivePinia(createPinia())
  })

  afterEach(() => {
    wrapper?.unmount()
    wrapper = null
    vi.useRealTimers()
  })

  async function mountEditor(content) {
    const {default: MarkdownEditor} =
      await import("../../../../src/renderer/src/ui/modules/RightPanel/{fragments}/Editor/{fragments}/MarkdownEditor.vue")
    wrapper = mount(MarkdownEditor, {props: {content}, attachTo: document.body, global: {directives: {tooltip: {}}}})
    return EditorView.findFromDOM(wrapper.element)
  }

  it("Ctrl+N moves the selection of an open completion list", async () => {
    vi.useFakeTimers()
    const view = await mountEditor("")
    typeText(view, "/")
    await vi.waitFor(() => expect(selectedCompletionIndex(view.state)).toBe(0))
    await vi.advanceTimersByTimeAsync(75)

    pressKey(view, {key: "n", ctrlKey: true})

    expect(selectedCompletionIndex(view.state)).toBe(1)
  })

  it("deleting a middle item renumbers the list", async () => {
    const view = await mountEditor("1. a\n2. b\n3. c\n4. d")
    view.dispatch({selection: {anchor: 5, head: 10}})

    pressKey(view, {key: "Backspace"})

    expect(view.state.doc.toString()).toBe("1. a\n2. c\n3. d")
  })

  it("content replaced from outside keeps its numbering", async () => {
    const view = await mountEditor("")

    await wrapper.setProps({content: "3. a\n4. b"})

    expect(view.state.doc.toString()).toBe("3. a\n4. b")
  })

  it("typing an opening bracket closes the pair around the caret", async () => {
    const view = await mountEditor("")

    typeText(view, "(")

    expect(view.state.doc.toString()).toBe("()")
    expect(view.state.selection.main.head).toBe(1)
  })

  it("Backspace between a bracket pair removes both halves", async () => {
    const view = await mountEditor("()")
    view.dispatch({selection: {anchor: 1}})

    pressKey(view, {key: "Backspace"})

    expect(view.state.doc.toString()).toBe("")
  })

  it("typing ```ts then Enter inside a list item closes the fence", async () => {
    const view = await mountEditor("- item\n  ")
    view.dispatch({selection: {anchor: view.state.doc.length}})

    typeText(view, "```ts")
    pressKey(view, {key: "Enter"})

    expect(view.state.doc.toJSON()).toEqual(["- item", "  ```ts", expect.any(String), "  ```"])
  })
})
