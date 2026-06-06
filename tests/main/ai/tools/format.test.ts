// @ts-nocheck
import {describe, expect, it} from "vitest"

import {toModelToolMessage, toRendererToolCall} from "@main/ai/tools/format"

describe("toModelToolMessage", () => {
  it("uses summary when present", () => {
    const s = toModelToolMessage({success: true, summary: "Created"})
    expect(JSON.parse(s)).toEqual({success: true, data: "Created"})
  })

  it("falls back to data string when summary is missing", () => {
    const s = toModelToolMessage({success: true, data: "Hello"})
    expect(JSON.parse(s)).toEqual({success: true, data: "Hello"})
  })

  it("emits structured data when neither summary nor data-string is available", () => {
    const s = toModelToolMessage({success: true, data: {foo: "bar"}})
    expect(JSON.parse(s)).toEqual({success: true, data: {foo: "bar"}})
  })

  it("emits an error envelope on failure", () => {
    const s = toModelToolMessage({success: false, error: "Boom"})
    expect(JSON.parse(s)).toEqual({success: false, error: "Boom"})
  })

  it("emits a minimal envelope when only success is set", () => {
    const s = toModelToolMessage({success: true})
    expect(JSON.parse(s)).toEqual({success: true})
  })
})

describe("toRendererToolCall", () => {
  it("returns summary when present", () => {
    expect(toRendererToolCall("create_task", {success: true, summary: "Created"})).toEqual({name: "create_task", result: "Created"})
  })

  it("returns data string when summary missing", () => {
    expect(toRendererToolCall("create_task", {success: true, data: "Hello"})).toEqual({name: "create_task", result: "Hello"})
  })

  it("returns error on failure", () => {
    expect(toRendererToolCall("create_task", {success: false, error: "Boom"})).toEqual({name: "create_task", result: "Boom"})
  })

  it("returns 'Done' fallback when success and no message", () => {
    expect(toRendererToolCall("create_task", {success: true})).toEqual({name: "create_task", result: "Done"})
  })

  it("returns 'Failed' fallback when failure and no message", () => {
    expect(toRendererToolCall("create_task", {success: false})).toEqual({name: "create_task", result: "Failed"})
  })
})
