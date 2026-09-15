import {describe, expect, it} from "vitest"

import {createMarkdownLanguageExtension} from "../../../../src/renderer/src/utils/codemirror/extensions"
import {mountEditorView, unmountEditorView} from "../../../helpers/editorView"

describe("canonical syntax highlighting", () => {
  it("applies highlight spans to fenced code via static grammars (no async load)", () => {
    const doc = "text\n\n```js\nconst a = () => 1\n```\n"
    const view = mountEditorView(doc, {extensions: [createMarkdownLanguageExtension()]})

    const colored = view.dom.querySelectorAll(".cm-line span[class]")
    const text = Array.from(colored)
      .map((e) => e.textContent)
      .join(" ")

    expect(colored.length).toBeGreaterThan(0)
    expect(text).toContain("const")

    unmountEditorView(view)
  })
})
