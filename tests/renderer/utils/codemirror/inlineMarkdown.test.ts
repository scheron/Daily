import {describe, expect, it} from "vitest"

import {renderInlineMarkdown} from "@/utils/codemirror/inlineMarkdown"

function html(text: string): string {
  const span = document.createElement("span")
  span.append(...renderInlineMarkdown(text))
  return span.innerHTML
}

describe("renderInlineMarkdown", () => {
  it("renders bold, italic, code, strikethrough", () => {
    expect(html("**b**")).toBe('<strong class="cm-strong">b</strong>')
    expect(html("*i*")).toBe('<em class="cm-emphasis">i</em>')
    expect(html("`c`")).toBe('<span class="cm-code">c</span>')
    expect(html("~~s~~")).toBe('<span style="text-decoration: line-through;">s</span>')
  })

  it("renders links as styled text (not navigable)", () => {
    expect(html("[label](http://x)")).toBe('<span class="cm-link">label</span>')
  })

  it("mixes plain text with inline tokens", () => {
    expect(html("a **b** c")).toBe('a <strong class="cm-strong">b</strong> c')
  })

  it("does not italicize underscores inside words", () => {
    expect(html("my_var_name")).toBe("my_var_name")
  })

  it("nests inline markup", () => {
    expect(html("**a `b`**")).toBe('<strong class="cm-strong">a <span class="cm-code">b</span></strong>')
  })

  it("leaves plain text untouched", () => {
    expect(html("just text")).toBe("just text")
  })
})
