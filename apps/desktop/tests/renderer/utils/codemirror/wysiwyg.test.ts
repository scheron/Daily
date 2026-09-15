import {describe, expect, it} from "vitest"

import {createMarkdownLanguageExtension, createWYSIWYGExtension} from "../../../../src/renderer/src/utils/codemirror/extensions"
import {mountEditorView, unmountEditorView} from "../../../helpers/editorView"

import type {EditorView} from "@codemirror/view"

function mount(doc: string, isReadonly = false) {
  return mountEditorView(doc, {extensions: [createMarkdownLanguageExtension(), createWYSIWYGExtension({isReadonly})]})
}

function focusAt(view: EditorView, cursor: number) {
  view.focus()
  view.dispatch({selection: {anchor: cursor}})
}

function lineTexts(view: EditorView): string[] {
  return Array.from(view.contentDOM.querySelectorAll(".cm-line")).map((line) => line.textContent ?? "")
}

describe("createWYSIWYGExtension", () => {
  it("hides heading and emphasis markers on a line the cursor is not on", () => {
    const heading = mount("# Title\n\nx")
    focusAt(heading, 9)
    expect(lineTexts(heading)[0]).toBe("Title")
    unmountEditorView(heading)

    const emphasis = mount("**b**\n\nx")
    focusAt(emphasis, 7)
    expect(lineTexts(emphasis)[0]).toBe("b")
    unmountEditorView(emphasis)
  })

  it("shows inline code without its backticks on a line the cursor is not on", () => {
    const view = mount("`code`\n\nx")
    focusAt(view, 8)
    expect(lineTexts(view)[0]).toBe("code")
    expect(view.contentDOM.querySelector(".cm-line span.cm-code")?.textContent).toBe("code")
    unmountEditorView(view)
  })

  it("reveals the raw image and link source on the line the cursor is on", () => {
    const imageDoc = "![image.png =500x209](daily://file/abc)"
    const image = mount(imageDoc)
    focusAt(image, imageDoc.length)
    expect(image.dom.querySelector(".cm-image-wrapper img")).toBeNull()
    expect(lineTexts(image)[0]).toBe(imageDoc)
    unmountEditorView(image)

    const linkDoc = "[text](http://x)"
    const link = mount(linkDoc)
    focusAt(link, 2)
    expect(link.dom.querySelector("a.cm-link-widget")).toBeNull()
    expect(lineTexts(link)[0]).toBe(linkDoc)
    unmountEditorView(link)

    const code = mount("`hello`")
    focusAt(code, 3)
    expect(lineTexts(code)[0]).toBe("`hello`")
    unmountEditorView(code)
  })

  it("renders images and hides link syntax on a line the cursor is not on", () => {
    const image = mount("![a](u)\n\nx")
    focusAt(image, 9)
    expect(image.dom.querySelector(".cm-image-wrapper img")).not.toBeNull()
    unmountEditorView(image)

    const link = mount("[text](http://x)\n\nx")
    focusAt(link, 18)
    expect(lineTexts(link)[0]).toBe("text")
    unmountEditorView(link)
  })

  it("renders links as a widget in readonly mode", () => {
    const view = mount("[text](http://x)", true)
    const widget = view.dom.querySelector("a.cm-link-widget")
    expect(widget?.textContent).toBe("text")
    unmountEditorView(view)
  })

  it("keeps fenced code fence lines as visible lines", () => {
    const view = mount("```js\nconst a = 1\n```\n")
    focusAt(view, 22)
    const lines = lineTexts(view)
    expect(lines).toContain("```js")
    expect(lines).toContain("```")
    unmountEditorView(view)
  })
})
