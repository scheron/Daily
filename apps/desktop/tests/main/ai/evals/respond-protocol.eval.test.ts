// @ts-nocheck
import {describe, expect, it} from "vitest"

import {makeFixture} from "../helpers/agentFixture"
import {respond, scriptedChat} from "../helpers/mockAiClient"

describe("EVAL: respond-protocol invariant", () => {
  it("model is asked with tool_choice 'required' on every iteration", async () => {
    const {ctrl} = await makeFixture()
    const {spy} = scriptedChat(ctrl as any, [respond("Hi.")])
    await ctrl.sendMessage("hi")
    expect(spy).toHaveBeenCalled()
    const [, , , toolChoice] = spy.mock.calls[0]
    expect(toolChoice).toBe("required")
  })

  it("respond.text becomes the AIMessage content", async () => {
    const {ctrl} = await makeFixture()
    scriptedChat(ctrl as any, [respond("All done.")])
    const r = await ctrl.sendMessage("hi")
    expect(r.success).toBe(true)
    expect(r.message?.content).toBe("All done.")
  })

  it("emits turn_finished after respond", async () => {
    const {ctrl, broadcastEvent} = await makeFixture()
    scriptedChat(ctrl as any, [respond("Done.")])
    await ctrl.sendMessage("hi")
    const last = broadcastEvent.mock.calls.at(-1)?.[0]
    expect(last?.type).toBe("turn_finished")
    expect(last?.finalMessage).toBe("Done.")
  })
})
