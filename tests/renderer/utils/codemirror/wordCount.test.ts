import {describe, expect, it} from "vitest"

import {countMarkdownWords} from "@/utils/codemirror/wordCount"

describe("countMarkdownWords", () => {
  it("returns 0 for empty or whitespace-only input", () => {
    expect(countMarkdownWords("")).toBe(0)
    expect(countMarkdownWords("   \n\t  ")).toBe(0)
  })

  it("counts words separated by whitespace", () => {
    expect(countMarkdownWords("  hello\n\nworld\t!  ")).toBe(3)
  })

  it("strips YAML frontmatter at the start of the document", () => {
    const body = "---\ntitle: foo\ntags: [a, b]\n---\nhello world"
    expect(countMarkdownWords(body)).toBe(2)
  })

  it("does not strip horizontal rules in the body", () => {
    const body = "# Heading\n\nfoo\n\n---\n\nbar"
    expect(countMarkdownWords(body)).toBe(5)
  })

  it("counts words inside inline and fenced code", () => {
    const body = 'use `console.log` here\n\n```ts\nconst value = "world"\n```'
    expect(countMarkdownWords(body)).toBe(9)
  })
})
