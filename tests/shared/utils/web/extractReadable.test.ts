// @ts-nocheck
import {describe, expect, it} from "vitest"

import {extractReadable} from "@shared/utils/web/extractReadable"

const article = `<!doctype html><html><head><title>My Post</title></head><body>
<article><h1>My Post</h1><p>${"This is the body of a real article. ".repeat(20)}</p></article>
<script>window.x = "should be stripped"</script></body></html>`

const shell = `<!doctype html><html><head><title>App</title></head><body><div id="root"></div><script src="/app.js"></script></body></html>`

describe("extractReadable", () => {
  it("extracts readable text from an article and strips scripts", () => {
    const out = extractReadable(article, "https://example.com/post")
    expect(out.emptyShell).toBe(false)
    expect(out.text).toContain("body of a real article")
    expect(out.title).toBe("My Post")
    expect(out.text).not.toContain("should be stripped")
  })

  it("flags a client-rendered shell as emptyShell", () => {
    const out = extractReadable(shell, "https://example.com/app")
    expect(out.emptyShell).toBe(true)
  })

  it("falls back to plain text for non-html content", () => {
    const out = extractReadable("just some plain text here that is long enough to keep", "https://example.com/x", "text/plain")
    expect(out.emptyShell).toBe(false)
    expect(out.text).toContain("plain text")
  })
})
