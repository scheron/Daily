// @ts-nocheck
import {beforeEach, describe, expect, it, vi} from "vitest"

import {NonRetryableError} from "../../../src/shared/errors/ai/NonRetryableError"
import {makeFixture} from "./helpers/agentFixture"

import type {AIController} from "../../../src/main/ai/AIController"

function priorAttachmentRound(): any[] {
  return [
    {role: "tool", tool_call_id: "c1", content: JSON.stringify({success: true, data: {id: "f1", name: "shot.png"}})},
    {
      role: "user",
      content: [
        {type: "text", text: 'The image from the attachment "shot.png":'},
        {type: "image_url", image_url: {url: "data:image/png;base64,QUJD"}},
      ],
    },
  ]
}

describe("AIController.sendMessage — a provider that rejects an image", () => {
  let ctrl: AIController
  let broadcastEvent: ReturnType<typeof vi.fn>

  beforeEach(async () => {
    const fixture = await makeFixture()
    ctrl = fixture.ctrl
    broadcastEvent = fixture.broadcastEvent
  })

  it("does not retry a mid-stream network error even with an image in play, so a delta already emitted is never duplicated", async () => {
    ;(ctrl as any).conversationHistory.push(...priorAttachmentRound())
    const chat = vi
      .spyOn((ctrl as any).openaiClient, "chat")
      .mockImplementationOnce(async (_messages: unknown, _tools: unknown, _signal: unknown, _toolChoice: unknown, callbacks: any) => {
        callbacks?.onDelta?.({kind: "content", text: "partial"})
        throw new Error("socket hang up")
      })
      .mockRejectedValue(new Error("test should not reach a second real chat call"))

    const result = await ctrl.sendMessage("hi")

    expect(result.success).toBe(false)
    expect(chat).toHaveBeenCalledTimes(1)
    const deltaEvents = broadcastEvent.mock.calls.filter(([event]) => event.type === "model_content_delta")
    expect(deltaEvents).toHaveLength(1)
  })

  it("retries exactly once on a rejection carrying an image, leaves the note, and cleans conversationHistory", async () => {
    ;(ctrl as any).conversationHistory.push(...priorAttachmentRound())

    const chat = vi
      .spyOn((ctrl as any).openaiClient, "chat")
      .mockRejectedValueOnce(new NonRetryableError("HttpError: Test HTTP 400 Bad Request this model does not support image_url", 400))
      .mockResolvedValueOnce({message: {role: "assistant", content: "I cannot see images."}, done: true})

    const result = await ctrl.sendMessage("what is in the image?")

    expect(result.success).toBe(true)
    expect(chat).toHaveBeenCalledTimes(2)

    const history = (ctrl as any).conversationHistory
    expect(history.some((m: any) => Array.isArray(m.content))).toBe(false)
    expect(history.some((m: any) => typeof m.content === "string" && m.content.includes("cannot see images"))).toBe(true)
  })

  it("does not retry a 429 rate limit even with an image present, leaving the image in history untouched", async () => {
    ;(ctrl as any).conversationHistory.push(...priorAttachmentRound())

    const chat = vi
      .spyOn((ctrl as any).openaiClient, "chat")
      .mockRejectedValueOnce(new NonRetryableError("HttpError: Test HTTP 429 Too Many Requests", 429))
      .mockRejectedValue(new Error("test should not reach a second real chat call"))

    const result = await ctrl.sendMessage("what is in the image?")

    expect(result.success).toBe(false)
    expect(chat).toHaveBeenCalledTimes(1)

    const history = (ctrl as any).conversationHistory
    expect(history.some((m: any) => Array.isArray(m.content))).toBe(true)
  })
})
