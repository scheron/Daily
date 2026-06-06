// @vitest-environment happy-dom
// @ts-nocheck
import {afterEach, beforeEach, describe, expect, it, vi} from "vitest"

import MessageReasoning from "@/ui/views/Assistant/{fragments}/MessageReasoning.vue"

import {mount} from "@vue/test-utils"

describe("MessageReasoning", () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it("shows the text by default (expanded)", () => {
    const w = mount(MessageReasoning, {props: {text: "thinking..."}})
    expect(w.html()).toContain("thinking...")
  })

  it("toggles collapse on header click", async () => {
    const w = mount(MessageReasoning, {props: {text: "thinking..."}})
    await w.find("button").trigger("click")
    expect(w.html()).not.toContain("thinking...")
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
