// @ts-nocheck
import {describe, expect, it, vi} from "vitest"

import {makeFixture, settle} from "../helpers/agentFixture"
import {callTool, respond, scriptedChat} from "../helpers/mockAiClient"

describe("EVAL: destructive tool requires confirmation", () => {
  it("CONFIRM path executes the tool and ends with the respond text", async () => {
    const {ctrl} = await makeFixture()
    const exec = vi.spyOn((ctrl as any).executor, "execute").mockResolvedValue({
      success: true,
      data: "Task moved to trash: abc",
      changedEntities: [{type: "task", id: "abc", action: "deleted"}],
    })
    scriptedChat(ctrl as any, [callTool("c1", "delete_task", {task_id: "abc"}), respond("Deleted.")])

    const sendPromise = ctrl.sendMessage("delete it")
    await settle()
    const pending = (ctrl as any).pendingConfirmation
    expect(pending).toBeTruthy()
    expect(pending.toolName).toBe("delete_task")
    ctrl.confirmToolCall(pending.id)

    const r = await sendPromise
    expect(r.success).toBe(true)
    expect(r.message?.content).toBe("Deleted.")
    expect(exec).toHaveBeenCalledOnce()
  })

  it("CANCEL path does NOT execute the tool", async () => {
    const {ctrl} = await makeFixture()
    const exec = vi.spyOn((ctrl as any).executor, "execute").mockResolvedValue({success: true})
    scriptedChat(ctrl as any, [callTool("c1", "delete_task", {task_id: "abc"}), respond("Cancelled per user.")])

    const sendPromise = ctrl.sendMessage("delete it")
    await settle()
    const pending = (ctrl as any).pendingConfirmation
    ctrl.cancelToolCall(pending.id)

    const r = await sendPromise
    expect(r.success).toBe(true)
    expect(exec).not.toHaveBeenCalled()
  })
})
