import {describe, expect, it} from "vitest"

import {renderMarkdownPreview} from "../../../../src/renderer/src/utils/codemirror/preview"

describe("renderMarkdownPreview", () => {
  it("keeps_TC-3_html_look-alikes_as_text_with_no_element_construction_or_script_execution", () => {
    const doc = 'Before <img src=x onerror="window.__pwned=1"> middle <script>window.__pwned=1</script> after <b>x</b> end'
    delete (globalThis as any).__pwned

    const preview = renderMarkdownPreview(doc, {isCompact: false})

    expect(preview.element.querySelector("img")).toBeNull()
    expect(preview.element.querySelector("script")).toBeNull()
    expect(preview.element.querySelector("b")).toBeNull()
    expect(preview.element.textContent).toContain('<img src=x onerror="window.__pwned=1">')
    expect(preview.element.textContent).toContain("<script>window.__pwned=1</script>")
    expect(preview.element.textContent).toContain("<b>x</b>")
    expect((globalThis as any).__pwned).toBeUndefined()
  })

  it("renders_TC-4_a_not-yet-loaded_language_plain_then_highlighted_once_it_settles", async () => {
    const doc = "```ruby\ndef greet\n  1\nend\n```"

    const first = renderMarkdownPreview(doc, {isCompact: false})
    const firstCodeLines = Array.from(first.element.querySelectorAll(".cm-codeblock-line:not(.cm-codeblock-first):not(.cm-codeblock-last)"))

    expect(first.element.textContent).toContain("def greet")
    expect(firstCodeLines.some((line) => line.querySelector("span[class]"))).toBe(false)
    expect(first.languagesLoaded).not.toBeNull()

    await first.languagesLoaded

    const second = renderMarkdownPreview(doc, {isCompact: false})
    const secondCodeLines = Array.from(second.element.querySelectorAll(".cm-codeblock-line:not(.cm-codeblock-first):not(.cm-codeblock-last)"))

    expect(secondCodeLines.some((line) => line.querySelector("span[class]"))).toBe(true)
  })
})
