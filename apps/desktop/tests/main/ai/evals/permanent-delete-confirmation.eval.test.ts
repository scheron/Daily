// @ts-nocheck
import {describe, expect, it, vi} from "vitest"

import {makeFixture, settle} from "../helpers/agentFixture"
import {callTool, respond, scriptedChat} from "../helpers/mockAiClient"

describe("EVAL: permanently_delete_task requires confirmation", () => {
  it("CONFIRM path executes; the confirmation carries a 'permanent' title", async () => {
    const {ctrl, broadcastConfirmation} = await makeFixture()
    const exec = vi.spyOn((ctrl as any).executor, "execute").mockResolvedValue({
      success: true,
      data: "Task permanently deleted: abc",
      changedEntities: [{type: "task", id: "abc", action: "deleted"}],
    })
    scriptedChat(ctrl as any, [callTool("c1", "permanently_delete_task", {task_id: "abc"}), respond("Permanently deleted.")])

    const sendPromise = ctrl.sendMessage("nuke it")
    await settle()
    const pending = (ctrl as any).pendingConfirmation
    expect(pending).toBeTruthy()
    expect(pending.title).toMatch(/permanent/i)

    const requiredBroadcast = broadcastConfirmation.mock.calls.find((c) => c[0]?.type === "required")
    expect(requiredBroadcast?.[0].confirmation.title).toMatch(/permanent/i)

    ctrl.confirmToolCall(pending.id)
    const r = await sendPromise
    expect(r.success).toBe(true)
    expect(exec).toHaveBeenCalledOnce()
  })

  it("CANCEL path leaves nothing destroyed", async () => {
    const {ctrl} = await makeFixture()
    const exec = vi.spyOn((ctrl as any).executor, "execute").mockResolvedValue({success: true})
    scriptedChat(ctrl as any, [callTool("c1", "permanently_delete_task", {task_id: "abc"}), respond("Skipped.")])

    const sendPromise = ctrl.sendMessage("nuke it")
    await settle()
    const pending = (ctrl as any).pendingConfirmation
    ctrl.cancelToolCall(pending.id)
    await sendPromise
    expect(exec).not.toHaveBeenCalled()
  })
})
