import {describe, expect, it} from "vitest"

import {
  createCodeSyntaxExtension,
  createMarkdownLanguageExtension,
  createThemeExtension,
  createWYSIWYGExtension,
} from "../../../../src/renderer/src/utils/codemirror/extensions"
import {mountEditorView, unmountEditorView} from "../../../helpers/editorView"

import type {EditorView} from "@codemirror/view"

const DOC = "before\n\n```js\nconst a = 1\nlet b\nvar c\n```\n\nafter"

function mount(cursor: number) {
  return mountEditorView(DOC, {
    selection: {anchor: cursor},
    extensions: [createThemeExtension(), createMarkdownLanguageExtension(), createWYSIWYGExtension({isReadonly: false}), createCodeSyntaxExtension()],
  })
}

function rawLines(view: EditorView) {
  return Array.from(view.contentDOM.querySelectorAll<HTMLElement>(".cm-codeblock-raw"))
}

function scrollTo(element: HTMLElement, left: number) {
  element.scrollLeft = left
  element.dispatchEvent(new Event("scroll"))
}

describe("raw code block shared horizontal scroll", () => {
  it("moves every line of the block when the bar under it is dragged", () => {
    const view = mount(DOC.indexOf("let b"))
    scrollTo(view.contentDOM.querySelector<HTMLElement>(".cm-codeblock-hscroll")!, 120)
    expect(rawLines(view).map((line) => line.scrollLeft)).toEqual([120, 120, 120, 120, 120])
    unmountEditorView(view)
  })

  it("moves the bar and the other lines when one line is scrolled on its own", () => {
    const view = mount(DOC.indexOf("let b"))
    const lines = rawLines(view)
    scrollTo(lines[2], 40)
    expect(lines.map((line) => line.scrollLeft)).toEqual([40, 40, 40, 40, 40])
    expect(view.contentDOM.querySelector<HTMLElement>(".cm-codeblock-hscroll")!.scrollLeft).toBe(40)
    unmountEditorView(view)
  })

  it("scrolls the block by a horizontal wheel gesture over any line and leaves a vertical one alone", () => {
    const view = mount(DOC.indexOf("let b"))
    const line = rawLines(view)[3]

    const vertical = new WheelEvent("wheel", {bubbles: true, cancelable: true, deltaX: 2, deltaY: 30})
    line.dispatchEvent(vertical)
    expect(vertical.defaultPrevented).toBe(false)
    expect(line.scrollLeft).toBe(0)

    const horizontal = new WheelEvent("wheel", {bubbles: true, cancelable: true, deltaX: 30, deltaY: 2})
    line.dispatchEvent(horizontal)
    expect(horizontal.defaultPrevented).toBe(true)
    expect(rawLines(view).map((each) => each.scrollLeft)).toEqual([30, 30, 30, 30, 30])
    unmountEditorView(view)
  })

  it("gives a line created by Enter the shared offset at once", () => {
    const view = mount(DOC.indexOf("let b"))
    scrollTo(view.contentDOM.querySelector<HTMLElement>(".cm-codeblock-hscroll")!, 90)

    const end = DOC.indexOf("let b") + "let b".length
    view.dispatch({changes: {from: end, insert: "\n"}, selection: {anchor: end + 1}, userEvent: "input"})

    const lines = rawLines(view)
    expect(lines).toHaveLength(6)
    expect(lines.map((line) => line.scrollLeft)).toEqual([90, 90, 90, 90, 90, 90])
    unmountEditorView(view)
  })

  it("keeps the widget offset when the cursor enters the block, and the block offset when it leaves", () => {
    const view = mount(0)
    scrollTo(view.contentDOM.querySelector<HTMLElement>(".cm-codeblock-scroll")!, 120)

    view.dispatch({selection: {anchor: DOC.indexOf("let b")}})
    expect(view.contentDOM.querySelector(".cm-codeblock-widget")).toBeNull()
    expect(rawLines(view).map((line) => line.scrollLeft)).toEqual([120, 120, 120, 120, 120])

    scrollTo(view.contentDOM.querySelector<HTMLElement>(".cm-codeblock-hscroll")!, 30)
    view.dispatch({selection: {anchor: 0}})
    expect(view.contentDOM.querySelector<HTMLElement>(".cm-codeblock-scroll")!.scrollLeft).toBe(30)
    unmountEditorView(view)
  })

  it("keeps the offset of a block when text above it changes", () => {
    const view = mount(DOC.indexOf("let b"))
    scrollTo(view.contentDOM.querySelector<HTMLElement>(".cm-codeblock-hscroll")!, 70)
    view.dispatch({changes: {from: 0, insert: "xyz\n"}})
    expect(rawLines(view).map((line) => line.scrollLeft)).toEqual([70, 70, 70, 70, 70])
    unmountEditorView(view)
  })
})
