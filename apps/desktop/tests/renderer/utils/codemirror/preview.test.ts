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
    const firstCodeLines = Array.from(first.element.querySelectorAll(".cm-codeblock-text-line"))

    expect(first.element.textContent).toContain("def greet")
    expect(firstCodeLines.some((line) => line.querySelector("span[class]"))).toBe(false)
    expect(first.languagesLoaded).not.toBeNull()

    await first.languagesLoaded

    const second = renderMarkdownPreview(doc, {isCompact: false})
    const secondCodeLines = Array.from(second.element.querySelectorAll(".cm-codeblock-text-line"))

    expect(secondCodeLines.some((line) => line.querySelector("span[class]"))).toBe(true)
  })

  it.each([[false], [true]])("draws_a_closed_fence_as_one_widget_without_backticks_in_compact_%s", (isCompact) => {
    const preview = renderMarkdownPreview("before\n\n```js\nconst a = 1\nlet b\n```\n\nafter", {isCompact})

    expect(preview.element.querySelectorAll(".cm-codeblock-widget")).toHaveLength(1)
    expect(preview.element.querySelectorAll(".cm-codeblock-text-line")).toHaveLength(2)
    expect(preview.element.querySelector(".cm-codeblock-widget span[class]")).not.toBeNull()
    expect(preview.element.querySelector(".cm-code-copy")).not.toBeNull()
    expect(preview.element.textContent).not.toContain("```")
    expect(preview.element.textContent).toContain("after")
  })

  it("keeps_an_unclosed_fence_raw_line_by_line", () => {
    const preview = renderMarkdownPreview("intro\n\n```js\nfoo\n\nA paragraph", {isCompact: false})

    expect(preview.element.querySelector(".cm-codeblock-widget")).toBeNull()
    expect(preview.element.textContent).toContain("```js")
    expect(preview.element.textContent).toContain("A paragraph")
  })

  it("clips_the_widget_in_a_compact_or_clipped_preview_and_lets_a_regular_one_scroll", () => {
    const doc = "```js\nlet a\n```"

    expect(renderMarkdownPreview(doc, {isCompact: false}).element.querySelector(".cm-codeblock-clip")).toBeNull()
    expect(renderMarkdownPreview(doc, {isCompact: true}).element.querySelector(".cm-codeblock-clip")).not.toBeNull()
    expect(renderMarkdownPreview(doc, {isCompact: false, isCodeClipped: true}).element.querySelector(".cm-codeblock-clip")).not.toBeNull()
  })

  it("highlights_a_search_match_inside_the_widget", () => {
    const doc = "```js\nconst needle = 1\n```"
    const start = doc.indexOf("needle")
    const matches = [{key: "content", value: doc, indices: [[start, start + 5]]}] as any

    const preview = renderMarkdownPreview(doc, {isCompact: true, matches})
    const marks = Array.from(preview.element.querySelectorAll(".cm-codeblock-widget .cm-search-highlight"))

    expect(marks.map((mark) => mark.textContent).join("")).toBe("needle")
    expect(preview.element.querySelector(".cm-codeblock-text-line")!.textContent).toBe("const needle = 1")
  })
})
