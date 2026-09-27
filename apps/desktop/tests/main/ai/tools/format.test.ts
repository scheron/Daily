// @ts-nocheck
import {describe, expect, it} from "vitest"

import {toModelImageMessage, toModelToolMessage, toPersistableToolResult, toRendererToolCall} from "../../../../src/main/ai/tools/format"

describe("toModelToolMessage", () => {
  it("uses summary when present", () => {
    const s = toModelToolMessage("create_task", {success: true, summary: "Created"})
    expect(JSON.parse(s)).toEqual({success: true, data: "Created"})
  })

  it("falls back to data string when summary is missing", () => {
    const s = toModelToolMessage("create_task", {success: true, data: "Hello"})
    expect(JSON.parse(s)).toEqual({success: true, data: "Hello"})
  })

  it("emits structured data when neither summary nor data-string is available", () => {
    const s = toModelToolMessage("create_task", {success: true, data: {foo: "bar"}})
    expect(JSON.parse(s)).toEqual({success: true, data: {foo: "bar"}})
  })

  it("emits an error envelope on failure", () => {
    const s = toModelToolMessage("create_task", {success: false, error: "Boom"})
    expect(JSON.parse(s)).toEqual({success: false, error: "Boom"})
  })

  it("emits a minimal envelope when only success is set", () => {
    const s = toModelToolMessage("create_task", {success: true})
    expect(JSON.parse(s)).toEqual({success: true})
  })

  it("never carries get_attachment's real bytes, even though the image itself rides separately", () => {
    const s = toModelToolMessage("get_attachment", {
      success: true,
      data: {id: "f1", name: "shot.png", mimeType: "image/png", size: 3, dataBase64: "QUJD"},
    })
    const parsed = JSON.parse(s)
    expect(parsed).toEqual({success: true, data: {id: "f1", name: "shot.png", mimeType: "image/png", size: 3, dataBase64: expect.any(String)}})
    expect(s).not.toContain("QUJD")
  })
})

describe("toModelImageMessage", () => {
  it("builds a user message carrying a text part naming the attachment, and an image_url part", () => {
    const result = {success: true, data: {id: "f1", name: "shot.png", mimeType: "image/png", size: 3, dataBase64: "QUJD"}}
    const message = toModelImageMessage("get_attachment", result)

    expect(message).toEqual({
      role: "user",
      content: [
        {type: "text", text: 'The image from the attachment "shot.png":'},
        {type: "image_url", image_url: {url: "data:image/png;base64,QUJD"}},
      ],
    })
  })

  it("is undefined for a non-image get_attachment result", () => {
    const result = {success: true, data: {id: "f1", name: "notes.txt"}}
    expect(toModelImageMessage("get_attachment", result)).toBeUndefined()
  })

  it("is undefined for every other tool's result, even one carrying image-shaped data", () => {
    const result = {success: true, data: {name: "shot.png", mimeType: "image/png", dataBase64: "QUJD"}}
    expect(toModelImageMessage("save_attachment", result)).toBeUndefined()
  })
})

describe("toPersistableToolResult", () => {
  it("replaces get_attachment's bytes with a placeholder, keeping its other fields", () => {
    const result = {success: true, data: {id: "f1", name: "shot.png", mimeType: "image/png", size: 3, dataBase64: "QUJD"}}
    const persisted = toPersistableToolResult("get_attachment", result)

    expect(persisted.data.dataBase64).not.toBe("QUJD")
    expect(persisted.data).toEqual({id: "f1", name: "shot.png", mimeType: "image/png", size: 3, dataBase64: persisted.data.dataBase64})
  })

  it("leaves a non-image get_attachment result untouched", () => {
    const result = {success: true, data: {id: "f1", name: "notes.txt"}}
    expect(toPersistableToolResult("get_attachment", result)).toEqual(result)
  })

  it("leaves every other tool's result untouched, even one carrying image-shaped data", () => {
    const result = {success: true, data: {mimeType: "image/png", dataBase64: "QUJD"}}
    expect(toPersistableToolResult("save_attachment", result)).toEqual(result)
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
