import {describe, expect, it} from "vitest"

import {EditorView} from "@codemirror/view"
import {
  createCodeSyntaxExtension,
  createMarkdownLanguageExtension,
  createTablesExtension,
  createThemeExtension,
  createWYSIWYGExtension,
} from "../../../../src/renderer/src/utils/codemirror/extensions"
import {mountEditorView, unmountEditorView} from "../../../helpers/editorView"

const LONG = "const veryLongIdentifierName = " + "'x'.repeat(10) + ".repeat(20) + "'end'"
const DOC = `before\n\n\`\`\`js\n${LONG}\nshort\n${LONG}\n\`\`\`\n\nafter`

function mount(doc: string, cursor: number) {
  const view = mountEditorView(doc, {
    selection: {anchor: cursor},
    extensions: [
      EditorView.lineWrapping,
      createThemeExtension(),
      createMarkdownLanguageExtension(),
      createWYSIWYGExtension({isReadonly: false}),
      createTablesExtension(),
      createCodeSyntaxExtension(),
    ],
  })
  return view
}

function horizontalScrollers(view: EditorView): HTMLElement[] {
  return Array.from(view.contentDOM.querySelectorAll<HTMLElement>("*")).filter((el) => {
    const overflowX = getComputedStyle(el).overflowX
    return overflowX === "auto" || overflowX === "scroll"
  })
}

describe("code block horizontal scroll", () => {
  it("styles a code block with long lines as one scroll container, not one per line (computed style only, layout unchecked)", () => {
    const view = mount(DOC, 0)
    const scrollers = horizontalScrollers(view)
    expect(scrollers.map((el) => el.className)).toHaveLength(1)
    expect(scrollers.some((el) => el.classList.contains("cm-line"))).toBe(false)
    unmountEditorView(view)
  })

  it("styles the lines of a raw block as unwrapped and unscrollable by themselves while the cursor is inside (computed style only, layout unchecked)", () => {
    const view = mount(DOC, DOC.indexOf("short"))
    expect(view.contentDOM.querySelector(".cm-codeblock-widget")).toBeNull()
    expect(horizontalScrollers(view).map((el) => el.className)).toEqual(["cm-codeblock-hscroll"])
    const lines = Array.from(view.contentDOM.querySelectorAll<HTMLElement>(".cm-codeblock-line"))
    expect(lines.length).toBeGreaterThan(0)
    expect(lines.every((el) => getComputedStyle(el).whiteSpace === "pre")).toBe(true)
    expect(lines.every((el) => getComputedStyle(el).overflowX === "hidden")).toBe(true)
    unmountEditorView(view)
  })
})
