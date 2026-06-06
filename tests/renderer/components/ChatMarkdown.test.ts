// @vitest-environment happy-dom
// @ts-nocheck
import {describe, expect, it} from "vitest"

import ChatMarkdown from "@/ui/views/Assistant/{fragments}/ChatMarkdown.vue"

import {mount} from "@vue/test-utils"

describe("ChatMarkdown", () => {
  it("renders plain text as a paragraph", () => {
    const w = mount(ChatMarkdown, {props: {text: "hello"}})
    expect(w.html()).toContain("hello")
  })

  it("renders bold and italic markdown", () => {
    const w = mount(ChatMarkdown, {props: {text: "**bold** and *italic*"}})
    expect(w.html()).toMatch(/<strong>bold<\/strong>/)
    expect(w.html()).toMatch(/<em>italic<\/em>/)
  })

  it("sanitizes raw HTML — does not render script", () => {
    const w = mount(ChatMarkdown, {props: {text: '<script>alert("x")</script>'}})
    expect(w.html()).not.toContain("<script>")
    expect(w.html()).toContain("&lt;script&gt;")
  })

  it("renders fenced code blocks with highlight", () => {
    const w = mount(ChatMarkdown, {props: {text: "```js\nconst x = 1\n```"}})
    expect(w.html()).toMatch(/<pre class="hljs"/)
  })

  it("renders partial code block as ongoing pre", () => {
    const w = mount(ChatMarkdown, {props: {text: "```js\nconst x = "}})
    expect(w.html()).toMatch(/<pre/)
  })

  it("linkifies bare URLs", () => {
    const w = mount(ChatMarkdown, {props: {text: "visit https://example.com today"}})
    expect(w.html()).toMatch(/<a [^>]*href="https:\/\/example\.com"/)
  })
})
