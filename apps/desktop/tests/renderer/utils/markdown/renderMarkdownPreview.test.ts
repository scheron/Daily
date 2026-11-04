import {afterEach, describe, expect, it, vi} from "vitest"

import {renderMarkdownPreview} from "@/utils/markdown/renderMarkdownPreview"
import {mockBridgeIPC} from "../../../helpers/bridgeIPC"

import type {SearchMatch} from "@daily/protocol"

describe("renderMarkdownPreview", () => {
  afterEach(() => vi.restoreAllMocks())

  it("keeps raw HTML visible as text without creating elements", () => {
    const source = 'Before <img src=x onerror="window.__pwned=1"> <b>bold</b>\n\n<script>window.__pwned=1</script>'
    const {element} = renderMarkdownPreview(source, {isCompact: false})

    expect(element.querySelector("img, script, b")).toBeNull()
    expect(element.textContent).toContain('<img src=x onerror="window.__pwned=1">')
    expect(element.textContent).toContain("<b>bold</b>")
    expect(element.textContent).toContain("<script>window.__pwned=1</script>")
  })

  it("renders visible soft and empty lines", () => {
    const {element} = renderMarkdownPreview("first\nsecond\n\n\nlast\n", {isCompact: false})
    const lines = Array.from(element.querySelectorAll(".markdown-preview-content > .markdown-line"))

    expect(lines.map((line) => line.textContent)).toEqual(["firstsecond", "", "", "last", ""])
    expect(lines[0].querySelector("br")).not.toBeNull()
    expect(lines.slice(1, 3).every((line) => line.querySelector("br"))).toBe(true)
  })

  it("renders titles, quotes, nested lists and immutable task checkboxes", () => {
    const source = "# Release **notes**\n\n> Please read\n\n3. Setup\n   - [x] Ready\n   - [ ] Follow-up\n\n---"
    const {element} = renderMarkdownPreview(source, {isCompact: false})

    expect(element.querySelector("h1 strong")?.textContent).toBe("notes")
    expect(element.querySelector("blockquote")?.textContent).toBe("Please read")
    expect(element.querySelector("ol")?.start).toBe(3)
    const checkboxes = [...element.querySelectorAll<HTMLInputElement>('ol ul input[type="checkbox"]')]
    expect(checkboxes.map(({checked, disabled}) => ({checked, disabled}))).toEqual([
      {checked: true, disabled: true},
      {checked: false, disabled: true},
    ])
    expect(element.querySelector(".markdown-divider")).not.toBeNull()
  })

  it("preserves formatted table cells, alignment and inert link labels", () => {
    const source = "| Term | Price |\n| :--- | ---: |\n| **hot *tea*** | [2](https://example.test) |"
    const {element} = renderMarkdownPreview(source, {isCompact: false})

    expect(element.querySelector(".markdown-table-wrapper th")?.textContent).toBe("Term")
    expect(element.querySelector("td strong em")?.textContent).toBe("tea")
    const price = element.querySelector<HTMLTableCellElement>("td:nth-child(2)")
    expect(price?.style.textAlign).toBe("right")
    expect(price?.textContent).toBe("2")
    expect(price?.querySelector("a")).toBeNull()
  })

  it("uses the shell bridge only for safe explicit links", () => {
    const ipc = mockBridgeIPC({"shell:open-external": vi.fn().mockResolvedValue(true)})
    const source = "[Guide](https://example.test) [Bad](javascript:alert%281%29) https://bare.test <https://auto.test>"
    const {element} = renderMarkdownPreview(source, {isCompact: false})
    const links = Array.from(element.querySelectorAll("a"))

    expect(links.map((link) => link.textContent)).toEqual(["Guide"])
    links[0].click()
    expect(ipc["shell:open-external"]).toHaveBeenCalledWith("https://example.test")
    expect(element.textContent).toContain("Bad https://bare.test https://auto.test")
  })

  it("renders a Daily image with its dimensions and decodes alt text once", () => {
    const source = "![Shot&#93; &amp;#93; =320x160](daily://file/DF-shot)"
    const {element} = renderMarkdownPreview(source, {isCompact: false})
    const image = element.querySelector("img")

    expect(image?.getAttribute("src")).toBe("daily://file/DF-shot")
    expect(image?.alt).toBe("Shot] &#93;")
    expect(image?.style.width).toBe("320px")
  })

  it("keeps a relative Markdown image target and its title", () => {
    const {element} = renderMarkdownPreview('![Screenshot](./screen.png "Example")', {isCompact: false})
    const image = element.querySelector("img")
    expect(image?.getAttribute("src")).toBe("./screen.png")
    expect(image?.title).toBe("Example")
  })

  it("renders an initially unloaded Ruby grammar once the language resolves", async () => {
    const doc = "\x60\x60\x60ruby\ndef greet\n  1\nend\n\x60\x60\x60"

    const first = renderMarkdownPreview(doc, {isCompact: false})
    expect(first.element.textContent).toContain("def greet")
    expect(first.element.querySelector(".markdown-code-line span[class]")).toBeNull()
    expect(first.languagesLoaded).not.toBeNull()

    await first.languagesLoaded
    const second = renderMarkdownPreview(doc, {isCompact: false})
    expect(second.element.querySelector(".markdown-code-line span[class]")).not.toBeNull()
    expect(second.languagesLoaded).toBeNull()
  })

  it.each([[false], [true]])("renders one code scroller without backticks when compact is %s", (isCompact) => {
    const source = "before\n\n\x60\x60\x60js\nconst a = 1\nlet b\n\x60\x60\x60\n\nafter"
    const {element} = renderMarkdownPreview(source, {isCompact})

    expect(element.querySelectorAll(".markdown-code-block .markdown-code-scroll")).toHaveLength(1)
    expect(element.querySelectorAll(".markdown-code-line")).toHaveLength(2)
    expect(element.querySelector(".markdown-code-block span[class]")).not.toBeNull()
    expect(element.querySelector('[aria-label="Copy code"]')).not.toBeNull()
    expect(element.textContent).not.toContain("\x60\x60\x60")
    expect(element.textContent).toContain("after")
  })

  it("keeps unclosed, indented and nested fences visible line by line", () => {
    for (const source of [
      "intro\n\n\x60\x60\x60js\nfoo\n\nA paragraph",
      "intro\n\n  \x60\x60\x60js\n  foo\n  \x60\x60\x60\n\nA paragraph",
      "- item\n\n  \x60\x60\x60js\n  foo\n  \x60\x60\x60\n\nA paragraph",
      "> \x60\x60\x60js\n> foo\n> \x60\x60\x60\n\nA paragraph",
    ]) {
      const {element} = renderMarkdownPreview(source, {isCompact: false})

      expect(element.querySelector(".markdown-code-block")).toBeNull()
      expect(element.querySelectorAll(".markdown-raw-code-block .markdown-code-line").length).toBeGreaterThan(1)
      expect(element.textContent).toContain("\x60\x60\x60js")
      expect(element.textContent).toContain("A paragraph")
    }
  })

  it("clips code on the board or in a compact preview and scrolls in a regular preview", () => {
    const source = "\x60\x60\x60js\nlet a\n\x60\x60\x60"

    expect(renderMarkdownPreview(source, {isCompact: false}).element.querySelector(".markdown-code-clipped")).toBeNull()
    expect(renderMarkdownPreview(source, {isCompact: true}).element.querySelector(".markdown-code-clipped")).not.toBeNull()
    expect(renderMarkdownPreview(source, {isCompact: false, isCodeClipped: true}).element.querySelector(".markdown-code-clipped")).not.toBeNull()
  })

  it("copies the code verbatim without its fences", async () => {
    const writeText = vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue(undefined)
    const source = "\x60\x60\x60\nconst a = 1\n\nlet b\n\x60\x60\x60"
    const {element} = renderMarkdownPreview(source, {isCompact: false})

    element.querySelector<HTMLButtonElement>('[aria-label="Copy code"]')?.click()
    expect(writeText).toHaveBeenCalledWith("const a = 1\n\nlet b")
  })

  it("highlights the selected occurrence in nested formatting and skips hidden link destinations", () => {
    const source = "A **same** [same](https://same.test) _same_"
    const {element} = renderMarkdownPreview(source, {
      isCompact: false,
      matches: [makeMatch(source, "same", source.indexOf("same.test")), makeMatch(source, "same", source.lastIndexOf("same"))],
    })

    const marks = Array.from(element.querySelectorAll(".markdown-search-highlight"))
    expect(marks.map((mark) => mark.textContent)).toEqual(["same"])
    expect(marks[0].parentElement?.tagName).toBe("EM")
  })

  it("highlights an escaped link label only for a match in the label", () => {
    const source = "[a\\]b](https://example.test/a]b)"
    const label = renderMarkdownPreview(source, {isCompact: false, matches: [makeMatch(source, "a\\]b")]})
    const destination = renderMarkdownPreview(source, {isCompact: false, matches: [makeMatch(source, "a]b")]})

    expect(label.element.querySelector("a .markdown-search-highlight")?.textContent).toBe("a]b")
    expect(destination.element.querySelector(".markdown-search-highlight")).toBeNull()
  })

  it("uses the whole link label when a code span contains a bracket", () => {
    const source = "[a \x60]\x60 b](https://example.test)"
    const {element} = renderMarkdownPreview(source, {isCompact: false, matches: [makeMatch(source, "b")]})

    expect(element.querySelector("a .markdown-search-highlight")?.textContent).toBe("b")
  })

  it("highlights an escaped pipe and a literal entity in their original table cells", () => {
    const source = "| Value | Value |\n| --- | --- |\n| **a\\|b** | a &amp; b |"
    const {element} = renderMarkdownPreview(source, {
      isCompact: false,
      matches: [makeMatch(source, "|", source.indexOf("\\|") + 1), makeMatch(source, "&amp;")],
    })

    const cells = element.querySelectorAll("tbody td")
    expect(cells[0].querySelector("strong .markdown-search-highlight")?.textContent).toBe("|")
    expect(cells[1].querySelector(".markdown-search-highlight")?.textContent).toBe("&amp;")
  })

  it("highlights a match on a tab-indented list continuation", () => {
    const source = "- first\n\tneedle"
    const {element} = renderMarkdownPreview(source, {isCompact: false, matches: [makeMatch(source, "needle")]})

    expect(element.querySelector("li .markdown-search-highlight")?.textContent).toBe("needle")
  })

  it("maps code matches to the right line inside a quoted list with Windows line endings", () => {
    const source = "> 1. Item\r\n>\r\n>    \x60\x60\x60js\r\n>    const js = 1\r\n>    const value = js\r\n>    \x60\x60\x60"
    const {element} = renderMarkdownPreview(source, {
      isCompact: false,
      matches: [makeMatch(source, "js", source.lastIndexOf("js"))],
    })

    const marks = Array.from(element.querySelectorAll(".markdown-raw-code-block .markdown-search-highlight"))
    expect(marks.map((mark) => mark.textContent)).toEqual(["js"])
    expect(marks[0].parentElement?.textContent).toBe("const value = js")
  })

  it("highlights a match spanning syntax tokens while skipping the hidden fence language", () => {
    const source = "\x60\x60\x60ts extra\nconst needle = 1\n\nnext\n\x60\x60\x60"
    const {element} = renderMarkdownPreview(source, {
      isCompact: true,
      matches: [makeMatch(source, "ts"), makeMatch(source, "const needle")],
    })

    expect(element.querySelector(".hljs-keyword .markdown-search-highlight")?.textContent).toBe("const")
    const marks = Array.from(element.querySelectorAll(".markdown-code-block .markdown-search-highlight"))
    expect(marks.map((mark) => mark.textContent).join("")).toBe("const needle")
    expect(Array.from(element.querySelectorAll(".markdown-code-line"), (line) => line.textContent)).toEqual(["const needle = 1", "", "next"])
  })

  it("leaves an unrecognized fence language as plain code", () => {
    const {element, languagesLoaded} = renderMarkdownPreview("\x60\x60\x60constructor\nconst value = 1\n\x60\x60\x60", {isCompact: false})
    const line = element.querySelector(".markdown-code-line")

    expect(line?.textContent).toBe("const value = 1")
    expect(line?.querySelector("span[class]")).toBeNull()
    expect(languagesLoaded).toBeNull()
  })
})

function makeMatch(source: string, value: string, from = source.indexOf(value)): SearchMatch {
  return {key: "content", value, indices: [[from, from + value.length - 1]]}
}
