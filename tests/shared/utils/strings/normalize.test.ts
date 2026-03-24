// @ts-nocheck
import {describe, expect, it} from "vitest"

import {normalize} from "@shared/utils/strings/normalize"

describe("normalize", () => {
  it("strips bold, italic, and header markdown formatting", () => {
    const boldItalic = normalize("**bold** _italic_")
    expect(boldItalic).toBe("bold italic")

    const heading = normalize("## Heading")
    expect(heading).toBe("heading")
  })

  it("replaces code blocks with a space and preserves inline code content", () => {
    const result = normalize("before ```\nsome code\n``` after and `inline` here")
    expect(result).toBe("before after and inline here")
  })

  it("collapses multiple spaces and trims whitespace", () => {
    const result = normalize("  too   many    spaces  ")
    expect(result).toBe("too many spaces")
  })

  it("truncates output to maxLength", () => {
    const result = normalize("abcdefghij", 5)
    expect(result).toBe("abcde")
    expect(result.length).toBe(5)
  })
})
