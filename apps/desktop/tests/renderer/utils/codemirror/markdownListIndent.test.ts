import {describe, expect, it} from "vitest"

import {createMarkdownLanguageExtension, createMarkdownListIndentExtension} from "../../../../src/renderer/src/utils/codemirror/extensions"
import {mountEditorView, unmountEditorView} from "../../../helpers/editorView"

function mount(doc: string) {
  return mountEditorView(doc, {extensions: [createMarkdownLanguageExtension(), createMarkdownListIndentExtension()]})
}

function firstLineStyle(doc: string): string | null {
  const view = mount(doc)
  const line = view.contentDOM.querySelector(".cm-line")
  const style = line?.classList.contains("cm-markdown-list-line") ? line.getAttribute("style") : null
  unmountEditorView(view)
  return style
}

describe("createMarkdownListIndentExtension", () => {
  it("aligns wrapped list text just after the marker", () => {
    expect(firstLineStyle("- item")).toBe("padding-left: 2ch; text-indent: -2ch;")
    expect(firstLineStyle("  - nested item")).toBe("padding-left: 4ch; text-indent: -4ch;")
    expect(firstLineStyle("10. ordered item")).toBe("padding-left: 4ch; text-indent: -4ch;")
  })

  it("counts a task checkbox into the hanging indent", () => {
    expect(firstLineStyle("- [ ] task item")).toBe("padding-left: 6ch; text-indent: -6ch;")
    expect(firstLineStyle("  - [x] nested task")).toBe("padding-left: 8ch; text-indent: -8ch;")
  })

  it("measures the indent from a list marker inside a blockquote", () => {
    expect(firstLineStyle("> - quoted item")).toBe("padding-left: 4ch; text-indent: -4ch;")
  })

  it("gives paragraphs and horizontal rules no hanging indent", () => {
    expect(firstLineStyle("plain paragraph")).toBeNull()
    expect(firstLineStyle("---")).toBeNull()
  })
})
