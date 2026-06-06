// @ts-nocheck
import {describe, expect, it} from "vitest"

import {consumeSseEvents} from "@main/ai/clients/common/streaming/sseParser"

describe("consumeSseEvents", () => {
  it("extracts a single event", () => {
    const out = consumeSseEvents(`data: {"a":1}\n\n`)
    expect(out.events).toEqual([`{"a":1}`])
    expect(out.remainder).toBe("")
  })

  it("extracts multiple events in one buffer", () => {
    const out = consumeSseEvents(`data: {"a":1}\n\ndata: {"a":2}\n\n`)
    expect(out.events).toEqual([`{"a":1}`, `{"a":2}`])
    expect(out.remainder).toBe("")
  })

  it("leaves incomplete trailing event in remainder", () => {
    const out = consumeSseEvents(`data: {"a":1}\n\ndata: {"a":`)
    expect(out.events).toEqual([`{"a":1}`])
    expect(out.remainder).toBe(`data: {"a":`)
  })

  it("recognizes [DONE]", () => {
    const out = consumeSseEvents(`data: [DONE]\n\n`)
    expect(out.events).toEqual([`[DONE]`])
    expect(out.remainder).toBe("")
  })

  it("ignores ':' keep-alive lines", () => {
    const out = consumeSseEvents(`: keep-alive\n\ndata: {"a":1}\n\n`)
    expect(out.events).toEqual([`{"a":1}`])
    expect(out.remainder).toBe("")
  })

  it("returns no events for empty buffer", () => {
    const out = consumeSseEvents("")
    expect(out.events).toEqual([])
    expect(out.remainder).toBe("")
  })
})
