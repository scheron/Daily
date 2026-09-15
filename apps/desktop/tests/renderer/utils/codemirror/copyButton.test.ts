import {describe, expect, it} from "vitest"

import {
  createCodeSyntaxExtension,
  createMarkdownLanguageExtension,
  createWYSIWYGExtension,
} from "../../../../src/renderer/src/utils/codemirror/extensions"
import {mountEditorView, unmountEditorView} from "../../../helpers/editorView"

function mount(doc: string) {
  return mountEditorView(doc, {
    extensions: [createMarkdownLanguageExtension(), createWYSIWYGExtension({isReadonly: false}), createCodeSyntaxExtension()],
  })
}

describe("code block copy button", () => {
  it("renders a copy button for a fenced code block", () => {
    const view = mount("```js\nconst a = 1\n```\n")
    expect(view.dom.querySelector("button.cm-code-copy")).not.toBeNull()
    unmountEditorView(view)
  })

  it("renders no copy button when there is no code block", () => {
    const view = mount("just some text\n")
    expect(view.dom.querySelector("button.cm-code-copy")).toBeNull()
    unmountEditorView(view)
  })
})
