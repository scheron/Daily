import {describe, expect, it, vi} from "vitest"

import {
  createCodeSyntaxExtension,
  createMarkdownLanguageExtension,
  createThemeExtension,
  createWYSIWYGExtension,
} from "../../../../src/renderer/src/utils/codemirror/extensions"
import {CodeBlockWidget} from "../../../../src/renderer/src/utils/codemirror/widgets"
import {mountEditorView, unmountEditorView} from "../../../helpers/editorView"

import type {EditorView} from "@codemirror/view"

const DOC = "before\n\n```js\nconst a = 1\nlet b\nvar c\n```\n\nafter"

function extensions() {
  return [createThemeExtension(), createMarkdownLanguageExtension(), createWYSIWYGExtension({isReadonly: false}), createCodeSyntaxExtension()]
}

function rawCodeSpans(view: EditorView, code: string) {
  const line = Array.from(view.contentDOM.querySelectorAll(".cm-codeblock-line")).find((el) => el.textContent === code)
  return line ? line.querySelectorAll("span").length : -1
}

function mount(cursor: number) {
  return mountEditorView(DOC, {selection: {anchor: cursor}, extensions: extensions()})
}

describe("code block widget", () => {
  it("draws a block away from the cursor as highlighted code lines with the fences hidden", () => {
    const view = mount(0)
    expect(view.contentDOM.querySelectorAll(".cm-codeblock-text-line")).toHaveLength(3)
    expect(view.contentDOM.querySelector(".cm-codeblock-widget span")).not.toBeNull()
    expect(view.contentDOM.textContent).not.toContain("```")
    unmountEditorView(view)
  })

  it("keeps the raw fenced source while the cursor is inside the block", () => {
    const view = mount(DOC.indexOf("let b"))
    expect(view.contentDOM.querySelector(".cm-codeblock-widget")).toBeNull()
    expect(view.contentDOM.querySelectorAll(".cm-codeblock-line")).toHaveLength(5)
    unmountEditorView(view)
  })

  it("puts the cursor on the clicked code line", () => {
    const view = mount(0)
    const line = view.contentDOM.querySelectorAll(".cm-codeblock-text-line")[2]
    line.dispatchEvent(new MouseEvent("mousedown", {bubbles: true, cancelable: true}))
    expect(view.state.selection.main.head).toBe(DOC.indexOf("var c"))
    unmountEditorView(view)
  })

  it("shows unclosed fences as raw text and never hides the document after them", () => {
    const doc = "intro\n\n```js\nfoo\n\nA paragraph\n\nLast paragraph"
    const view = mountEditorView(doc, {selection: {anchor: 0}, extensions: extensions()})
    expect(view.contentDOM.querySelector(".cm-codeblock-widget")).toBeNull()
    expect(view.contentDOM.textContent).toContain("Last paragraph")
    unmountEditorView(view)
  })

  it("survives a lone opening fence", () => {
    const view = mountEditorView("intro\n\n```js", {selection: {anchor: 0}, extensions: extensions()})
    expect(view.contentDOM.querySelector(".cm-codeblock-widget")).toBeNull()
    expect(() => view.dispatch({selection: {anchor: 12}})).not.toThrow()
    unmountEditorView(view)
  })

  it("keeps the same DOM and horizontal scroll when text above the block changes", () => {
    const view = mount(0)
    const scroller = view.contentDOM.querySelector<HTMLElement>(".cm-codeblock-scroll")!
    scroller.scrollLeft = 120
    view.dispatch({changes: {from: 0, insert: "x"}, selection: {anchor: 0}})
    const after = view.contentDOM.querySelector<HTMLElement>(".cm-codeblock-scroll")!
    expect(after).toBe(scroller)
    expect(after.scrollLeft).toBe(120)
    unmountEditorView(view)
  })

  it("puts the cursor on the clicked line after text above the block changed", () => {
    const view = mount(0)
    view.dispatch({changes: {from: 0, insert: "xyz\n"}, selection: {anchor: 0}})
    view.contentDOM.querySelectorAll(".cm-codeblock-text-line")[1].dispatchEvent(new MouseEvent("mousedown", {bubbles: true, cancelable: true}))
    expect(view.state.sliceDoc(view.state.selection.main.head, view.state.selection.main.head + 5)).toBe("let b")
    unmountEditorView(view)
  })

  it("opens the block only on a primary-button click", () => {
    const view = mount(0)
    const line = view.contentDOM.querySelectorAll(".cm-codeblock-text-line")[1]
    line.dispatchEvent(new MouseEvent("mousedown", {bubbles: true, cancelable: true, button: 2}))
    expect(view.state.selection.main.head).toBe(0)
    unmountEditorView(view)
  })

  it.each([["~~~js\nlet a\n~~~"], ["````js\nlet a\n````"], ["``` js\nlet a\n```"]])("highlights the fence %j like the raw block does", (fence) => {
    const doc = `before\n\n${fence}\n\nafter`
    const widgetView = mountEditorView(doc, {selection: {anchor: 0}, extensions: extensions()})
    const rawView = mountEditorView(doc, {selection: {anchor: doc.indexOf("let a")}, extensions: extensions()})
    const widgetSpans = widgetView.contentDOM.querySelectorAll(".cm-codeblock-body span").length
    const rawSpans = rawCodeSpans(rawView, "let a")
    expect(widgetSpans).toBeGreaterThan(0)
    expect(widgetSpans).toBe(rawSpans)
    unmountEditorView(widgetView)
    unmountEditorView(rawView)
  })

  it("leaves an unresolvable language plain, named in data-language, as the raw block does", () => {
    const doc = "before\n\n```c#\nint a\n```\n\nafter"
    const view = mountEditorView(doc, {selection: {anchor: 0}, extensions: extensions()})
    expect(view.contentDOM.querySelector(".cm-codeblock-widget")?.getAttribute("data-language")).toBe("c#")
    expect(view.contentDOM.querySelectorAll(".cm-codeblock-body span")).toHaveLength(0)
    view.dispatch({selection: {anchor: doc.indexOf("int a")}})
    expect(rawCodeSpans(view, "int a")).toBe(0)
    unmountEditorView(view)
  })

  it("keeps an indented, listed or quoted fence raw", () => {
    for (const doc of ["a\n\n  ```js\n  let a\n  ```\n\nz", "- item\n\n  ```js\n  let a\n  ```\n\nz", "> ```js\n> let a\n> ```\n\nz"]) {
      const view = mountEditorView(doc, {selection: {anchor: 0}, extensions: extensions()})
      expect(view.contentDOM.querySelector(".cm-codeblock-widget")).toBeNull()
      unmountEditorView(view)
    }
  })

  it("copies the code without its fences from the widget button", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, "clipboard", {value: {writeText}, configurable: true})
    const view = mount(0)
    view.contentDOM.querySelector(".cm-codeblock-widget .cm-code-copy")!.dispatchEvent(new MouseEvent("click", {bubbles: true}))
    await vi.waitFor(() => expect(writeText).toHaveBeenCalledWith("const a = 1\nlet b\nvar c"))
    unmountEditorView(view)
  })

  it("estimates the height of an off-screen block from its line count", () => {
    const few = new CodeBlockWidget("a", "js").estimatedHeight
    const many = new CodeBlockWidget(Array.from({length: 50}, () => "a").join("\n"), "js").estimatedHeight
    expect(many - few).toBeGreaterThan(49 * 14)
  })
})
