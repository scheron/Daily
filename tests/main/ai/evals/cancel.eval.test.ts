// @ts-nocheck
import {describe, expect, it, vi} from "vitest"

import {makeFixture, settle} from "../helpers/agentFixture"
import {callTool, scriptedChat} from "../helpers/mockAiClient"

describe("EVAL: cancel mid-turn rolls back cleanly", () => {
  it("cancel() while awaiting confirmation resolves to a cancelled turn with empty history", async () => {
    const {ctrl} = await makeFixture()
    vi.spyOn((ctrl as any).executor, "execute").mockResolvedValue({success: true})
    scriptedChat(ctrl as any, [
      callTool("c1", "delete_task", {task_id: "abc"}),
      // Second iteration aborts because cancel() also fires AbortController.
      {throws: Object.assign(new Error("aborted"), {name: "AbortError"})},
    ])

    const sendPromise = ctrl.sendMessage("delete it")
    await settle()
    expect((ctrl as any).pendingConfirmation).toBeTruthy()

    ctrl.cancel()
    const r = await sendPromise

    expect(r.success).toBe(false)
    expect(r.error).toBe("Request cancelled")
    expect((ctrl as any).pendingConfirmation).toBeNull()
    expect((ctrl as any).conversationHistory).toHaveLength(0)
  })
})
