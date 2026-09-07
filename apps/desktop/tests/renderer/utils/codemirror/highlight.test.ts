import {describe, expect, it} from "vitest"

import {EditorState} from "@codemirror/state"
import {EditorView} from "@codemirror/view"
import {createMarkdownLanguageExtension} from "../../../../src/renderer/src/utils/codemirror/extensions/markdownLanguage"

describe("canonical syntax highlighting", () => {
  it("applies highlight spans to fenced code via static grammars (no async load)", () => {
    const doc = "text\n\n```js\nconst a = () => 1\n```\n"
    const parent = document.createElement("div")
    document.body.appendChild(parent)

    const view = new EditorView({
      state: EditorState.create({doc, extensions: [createMarkdownLanguageExtension()]}),
      parent,
    })

    // syntaxHighlighting emits scoped classes (ͼ…) synchronously — no setTimeout needed
    const colored = parent.querySelectorAll(".cm-line span[class]")
    const text = Array.from(colored)
      .map((e) => e.textContent)
      .join(" ")

    expect(colored.length).toBeGreaterThan(0)
    expect(text).toContain("const")

    view.destroy()
  })
})
