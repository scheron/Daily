import {afterEach, describe, expect, it, vi} from "vitest"

import {extractFileIds} from "@daily/core/utils/files/extractFileIds"

import {createDailyMarkdownExtensions} from "@/ui/common/misc/MarkdownEditor/utils/createDailyMarkdownExtensions"
import {Editor} from "@tiptap/core"

describe("Daily Markdown in TipTap", () => {
  const editors: Editor[] = []

  afterEach(() => {
    for (const editor of editors.splice(0)) editor.destroy()
    vi.restoreAllMocks()
  })

  function open(markdown: string) {
    const editor = new Editor({
      content: markdown,
      contentType: "markdown",
      element: document.createElement("div"),
      enableContentCheck: true,
      extensions: createDailyMarkdownExtensions(),
    })
    editors.push(editor)
    return editor
  }

  function appendParagraph(editor: Editor) {
    editor.commands.insertContentAt(editor.state.doc.content.size, {type: "paragraph", content: [{type: "text", text: "Unrelated edit"}]})
    return open(editor.getMarkdown())
  }

  it("preserves spaces inside code and escaped pipes in table cells after reopening", () => {
    const editor = open("Before\n\n| Name | Code |\n| :--- | ---: |\n| A \\| B | `a  b` |\n\nAfter")

    const reopened = appendParagraph(editor)

    expect(reopened.getJSON().content?.slice(0, -1)).toEqual(editor.getJSON().content?.slice(0, -1))
    expect(reopened.view.dom.querySelector("td")?.textContent).toBe("A | B")
    expect(reopened.view.dom.querySelector("td code")?.textContent).toBe("a  b")
    expect(
      reopened
        .getMarkdown()
        .split("\n")
        .some((line) => line.includes(":---") && line.includes("---:")),
    ).toBe(true)
  })

  it("keeps a line of backticks inside the code block and a later list outside it", () => {
    const editor = open('~~~~typescript caption="example"\nfirst line  \n```\nlast line\n~~~~\n\n1. Outside')

    const reopened = open(editor.getMarkdown())

    expect(reopened.view.dom.querySelector("pre")?.textContent).toBe("first line  \n```\nlast line")
    expect(reopened.view.dom.querySelector("ol")?.textContent).toBe("Outside")
    expect(reopened.getJSON().content?.[0].attrs?.language).toBe('typescript caption="example"')
  })

  it("copies the latest edited code without including its Markdown fence", async () => {
    const editor = open("```js\nconst count = 1\n```")
    const clipboard = vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue()
    const button = editor.view.dom.querySelector<HTMLButtonElement>('[aria-label="Copy code"]')

    expect(button).not.toBeNull()
    editor.commands.insertContentAt({from: 1, to: 1 + "const count = 1".length}, "const count = 2")
    button?.click()

    await vi.waitFor(() => expect(button?.classList.contains("is-copied")).toBe(true))
    expect(clipboard).toHaveBeenCalledWith("const count = 2")
    expect(editor.view.dom.querySelector("pre code .hljs-keyword")?.textContent).toBe("const")
  })

  it("exports an unmatched parenthesis in a link destination using valid Markdown", () => {
    const editor = open("[Link](<https://example.test/a(b>)")

    expect(editor.getMarkdown()).toBe("[Link](<https://example.test/a(b>)")
  })

  it("keeps literal HTML and comments visible as text through the round trip", () => {
    const inline = "Text with <b>literal tags</b>."
    const block = '<div class="daily-fixture">Raw HTML</div>'
    const comment = "<!-- keep me -->"
    const markup = '<img src="https://example.test/image.png" alt="literal">'
    const editor = open([inline, block, comment, markup].join("\n\n"))

    const reopened = open(editor.getMarkdown())

    expect(reopened.view.dom.textContent).toContain(inline)
    expect(reopened.view.dom.textContent).toContain(block)
    expect(reopened.view.dom.textContent).toContain(comment)
    expect(reopened.view.dom.textContent).toContain(markup)
    expect(reopened.view.dom.querySelector("img")).toBeNull()
  })

  it("preserves standalone and inline Daily attachment links with dimensions", () => {
    const standalone = "![Shot =320x180](daily://file/DF-standalone)"
    const inline = "Before ![Inline =500x169](daily://file/DF-inline) after"
    const editor = open([standalone, inline].join("\n\n"))

    const reopened = open(editor.getMarkdown())

    expect([...reopened.view.dom.querySelectorAll("img[src]")].map((img) => img.getAttribute("src"))).toEqual([
      "daily://file/DF-standalone",
      "daily://file/DF-inline",
    ])
    expect(reopened.getMarkdown()).toBe([standalone, inline].join("\n\n"))
  })

  it("keeps image labels with escaped brackets and backslashes after an unrelated edit", () => {
    const source = "![a\\]b\\\\c =320x180](daily://file/DF-escaped)"
    const editor = open(source)

    const reopened = appendParagraph(editor)
    const image = reopened.view.dom.querySelector("img[src]")

    expect(image?.getAttribute("src")).toBe("daily://file/DF-escaped")
    expect(image?.alt).toBe("a]b\\c")
    expect(extractFileIds(reopened.getMarkdown())).toEqual(["DF-escaped"])
  })

  it("keeps a nested mixed list and its start number after an unrelated edit", () => {
    const editor = open("7. Ordered at seven\n   - Nested bullet\n     - [ ] Pending\n     - [x] Done\n8. Second")
    const before = editor.state.doc.firstChild

    const reopened = appendParagraph(editor)

    expect(reopened.state.doc.firstChild?.toJSON()).toEqual(before?.toJSON())
    expect(reopened.view.dom.querySelector("ol")?.getAttribute("start")).toBe("7")
    expect(reopened.view.dom.querySelectorAll('li[data-type="taskItem"]')).toHaveLength(2)
  })

  it("keeps separated paragraphs and hard line breaks after an unrelated edit", () => {
    const editor = open("Line 1  \nLine 2\n\n\n\nAfter blank lines\\\nLine 4")
    const previousParagraphs = editor.getJSON().content

    const reopened = appendParagraph(editor)

    expect(reopened.getJSON().content?.slice(0, -1)).toEqual(previousParagraphs)
    expect(reopened.view.dom.querySelector("p")?.innerHTML).toContain("Line 1<br>Line 2")
  })

  it("retains the target and title of a reference link after an unrelated edit", () => {
    const editor = open('[Reference][ref]\n\n[ref]: https://example.test/path "Reference title"')

    const reopened = appendParagraph(editor)
    const link = reopened.view.dom.querySelector("a")

    expect(link?.textContent).toBe("Reference")
    expect(link?.getAttribute("href")).toBe("https://example.test/path")
    expect(link?.getAttribute("title")).toBe("Reference title")
  })

  it("keeps escaped block punctuation as text after an unrelated edit", () => {
    const editor = open("\\# Heading-like text\n\n\\- List-like text\n\n1\\. Ordered-list-like text\n\nNo setext heading\n\\===")
    const previousParagraphs = editor.getJSON().content

    const reopened = appendParagraph(editor)

    expect(reopened.getJSON().content?.slice(0, -1)).toEqual(previousParagraphs)
  })
})
