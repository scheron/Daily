// @ts-nocheck
import {beforeEach, describe, expect, it, vi} from "vitest"

import {NonRetryableError} from "../../../src/shared/errors/ai/NonRetryableError"
import {makeFixture} from "./helpers/agentFixture"

import type {AIController} from "../../../src/main/ai/AIController"

const REAL_BASE64 = "QUJD"

describe("AIController.sendMessage — an attachment's bytes never reach persistence or the renderer", () => {
  let ctrl: AIController
  let storage: any

  beforeEach(async () => {
    const fixture = await makeFixture()
    ctrl = fixture.ctrl
    storage = fixture.storage
  })

  it("persists a placeholder instead of dataBase64, and reports a safe result to the renderer", async () => {
    vi.spyOn((ctrl as any).executor, "execute").mockResolvedValue({
      success: true,
      data: {id: "f1", name: "shot.png", mimeType: "image/png", size: 3, dataBase64: REAL_BASE64},
    })

    const script = [
      {
        message: {
          role: "assistant",
          content: null,
          tool_calls: [{id: "c1", type: "function", function: {name: "get_attachment", arguments: {id: "f1"}}}],
        },
        done: true,
      },
      {message: {role: "assistant", content: "Here it is."}, done: true},
    ]
    let i = 0
    vi.spyOn((ctrl as any).openaiClient, "chat").mockImplementation(async () => {
      if (i < script.length) return script[i++]
      throw new Error("test should not reach a third chat call")
    })

    const result = await ctrl.sendMessage("what's in the attachment?")

    expect(result.success).toBe(true)
    expect(JSON.stringify(result.message?.toolCalls)).not.toContain(REAL_BASE64)

    expect(storage.appendAiTurn).toHaveBeenCalledOnce()
    const [persistedTurn] = storage.appendAiTurn.mock.calls[0]
    const persisted = JSON.stringify(persistedTurn)
    expect(persisted).not.toContain(REAL_BASE64)

    const toolResultStep = persistedTurn.steps.find((step: any) => step.type === "tool_result")
    expect(toolResultStep.result.data.dataBase64).not.toBe(REAL_BASE64)
    expect(toolResultStep.result.data.name).toBe("shot.png")
  })

  it("never sends the raw bytes to the model as text — not on the first call, and not on a forced retry", async () => {
    vi.spyOn((ctrl as any).executor, "execute").mockResolvedValue({
      success: true,
      data: {id: "f1", name: "shot.png", mimeType: "image/png", size: 3, dataBase64: REAL_BASE64},
    })

    const toolCallRequest = {
      message: {
        role: "assistant",
        content: null,
        tool_calls: [{id: "c1", type: "function", function: {name: "get_attachment", arguments: {id: "f1"}}}],
      },
      done: true,
    }
    const finalAnswer = {message: {role: "assistant", content: "I cannot see images, but here is what I know."}, done: true}

    let call = 0
    const seenMessages: any[] = []
    vi.spyOn((ctrl as any).openaiClient, "chat").mockImplementation(async (messages: any[]) => {
      seenMessages.push(...messages)
      call++
      if (call === 1) return toolCallRequest
      if (call === 2) throw new NonRetryableError("HttpError: Test HTTP 400 Bad Request this model does not support image_url", 400)
      if (call === 3) return finalAnswer
      throw new Error("test should not reach a fourth chat call")
    })

    const result = await ctrl.sendMessage("what's in the attachment?")

    expect(result.success).toBe(true)
    expect(call).toBe(3)

    const toolMessages = seenMessages.filter((m) => m.role === "tool")
    expect(toolMessages.length).toBeGreaterThan(1)
    for (const message of toolMessages) {
      expect(String(message.content)).not.toContain(REAL_BASE64)
    }

    const imageParts = seenMessages.flatMap((m) => (Array.isArray(m.content) ? m.content : [])).filter((part: any) => part.type === "image_url")
    expect(imageParts.length).toBeGreaterThan(0)
    expect(imageParts.some((part: any) => part.image_url.url.includes(REAL_BASE64))).toBe(true)
  })
})
