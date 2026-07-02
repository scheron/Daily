import {describe, expect, it} from "vitest"

import {createCodeSyntaxExtension, createMarkdownLanguageExtension, createWYSIWYGExtension} from "@/utils/codemirror/extensions"

import {EditorState} from "@codemirror/state"
import {EditorView} from "@codemirror/view"

function mount(doc: string) {
  const parent = document.createElement("div")
  document.body.appendChild(parent)
  return new EditorView({
    state: EditorState.create({
      doc,
      extensions: [createMarkdownLanguageExtension(), createWYSIWYGExtension({readonly: false}), createCodeSyntaxExtension()],
    }),
    parent,
  })
}

describe("code block copy button", () => {
  it("renders a copy button for a fenced code block", () => {
    const view = mount("```js\nconst a = 1\n```\n")
    expect(view.dom.querySelector("button.cm-code-copy")).not.toBeNull()
    view.destroy()
  })

  it("renders no copy button when there is no code block", () => {
    const view = mount("just some text\n")
    expect(view.dom.querySelector("button.cm-code-copy")).toBeNull()
    view.destroy()
  })
})
