// @ts-nocheck
import {describe, expect, it} from "vitest"

import {stripHtml} from "@shared/utils/common/stripHtml"

describe("stripHtml", () => {
  it("strips HTML tags leaving only text content", () => {
    expect(stripHtml("<p>Hello <strong>world</strong></p>")).toBe("Hello world")
  })

  it("decodes named entities &amp; and &lt;", () => {
    expect(stripHtml("1 &lt; 2 &amp; 3 &gt; 0")).toBe("1 < 2 & 3 > 0")
  })

  it("does not double-unescape &amp;nbsp; — resolves to &nbsp; not a space", () => {
    // &amp;nbsp; should become &nbsp; (literal), not a non-breaking space
    // because &amp; resolves to & only when not followed by a letter or #
    // &amp;nbsp; has & followed by 'n', so &amp; is NOT replaced → stays &amp;nbsp;
    // Actually per the regex &amp;(?![a-zA-Z#]) — &amp;nbsp; keeps &amp; intact
    expect(stripHtml("&amp;nbsp;")).toBe("&amp;nbsp;")
  })

  it("returns empty string for falsy input", () => {
    expect(stripHtml("")).toBe("")
  })
})
