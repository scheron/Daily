// @vitest-environment happy-dom
// @ts-nocheck
import {afterEach, beforeEach, describe, expect, it, vi} from "vitest"

import MessageReasoning from "@/ui/views/Assistant/{fragments}/MessageReasoning.vue"

import {mount} from "@vue/test-utils"

describe("MessageReasoning", () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it("is collapsed by default when not streaming", () => {
    const w = mount(MessageReasoning, {props: {text: "thinking..."}})
    expect(w.html()).not.toContain("thinking...")
  })

  it("is expanded while streaming", () => {
    const w = mount(MessageReasoning, {props: {text: "thinking...", streaming: true}})
    expect(w.html()).toContain("thinking...")
  })

  it("expands on header click", async () => {
    const w = mount(MessageReasoning, {props: {text: "thinking..."}})
    expect(w.html()).not.toContain("thinking...")
    await w.find("button").trigger("click")
    expect(w.html()).toContain("thinking...")
  })

  it("shows durationMs label when not streaming", () => {
    const w = mount(MessageReasoning, {props: {text: "x", durationMs: 12340}})
    expect(w.text()).toMatch(/12s/)
  })

  it("shows thinking Ns badge when streaming and increments", async () => {
    const w = mount(MessageReasoning, {props: {text: "x", streaming: true}})
    expect(w.text()).toMatch(/Thinking.*0s/)
    await vi.advanceTimersByTimeAsync(2500)
    await w.vm.$nextTick()
    expect(w.text()).toMatch(/Thinking.*2s/)
  })
})
