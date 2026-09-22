// @ts-nocheck
import {describe, expect, it, vi} from "vitest"

import {createPolicyHook} from "../../../../src/main/ai/policy/policyHook"

const ctx = {turnId: "t1", userMessage: "x", startedAt: 0, messages: []} as any

function call(name: string, args: unknown = {}) {
  return {id: "c1", type: "function", function: {name, arguments: JSON.stringify(args)}} as any
}

describe("policyHook", () => {
  it("passes non-destructive tools through without prompting", async () => {
    const host = {awaitConfirmation: vi.fn(async () => true)}
    const hook = createPolicyHook(host)
    const d = await hook(ctx, call("list_tasks"))
    expect(d).toEqual({action: "pass"})
    expect(host.awaitConfirmation).not.toHaveBeenCalled()
  })

  it("calls awaitConfirmation for a destructive tool and passes on true", async () => {
    const host = {awaitConfirmation: vi.fn(async () => true)}
    const hook = createPolicyHook(host)
    const d = await hook(ctx, call("delete_task", {task_id: "abc"}))
    expect(host.awaitConfirmation).toHaveBeenCalledWith("delete_task", {task_id: "abc"})
    expect(d).toEqual({action: "pass"})
  })

  it("skips with a user-facing reason when confirmation returns false", async () => {
    const host = {awaitConfirmation: vi.fn(async () => false)}
    const hook = createPolicyHook(host)
    const d = await hook(ctx, call("delete_task", {task_id: "abc"}))
    expect(d.action).toBe("skip")
    expect((d as any).reason).toMatch(/declin|cancel/i)
  })

  it("suspends delete_task_comment on confirmation the same way delete_task does, and writing one passes straight through", async () => {
    const host = {awaitConfirmation: vi.fn(async () => true)}
    const hook = createPolicyHook(host)

    const deleted = await hook(ctx, call("delete_task_comment", {comment_id: "c1"}))
    expect(host.awaitConfirmation).toHaveBeenCalledWith("delete_task_comment", {comment_id: "c1"})
    expect(deleted).toEqual({action: "pass"})

    const declining = {awaitConfirmation: vi.fn(async () => false)}
    const declined = await createPolicyHook(declining)(ctx, call("delete_task_comment", {comment_id: "c1"}))
    expect(declined.action).toBe("skip")

    host.awaitConfirmation.mockClear()
    const written = await hook(ctx, call("save_task_comment", {task_id: "t1", content: "note"}))
    expect(written).toEqual({action: "pass"})
    expect(host.awaitConfirmation).not.toHaveBeenCalled()
  })

  it("skips unknown tool names without calling the host", async () => {
    const host = {awaitConfirmation: vi.fn(async () => true)}
    const hook = createPolicyHook(host)
    const d = await hook(ctx, call("totally_made_up_tool"))
    expect(d.action).toBe("skip")
    expect(host.awaitConfirmation).not.toHaveBeenCalled()
  })

  it("parses string arguments before forwarding to host", async () => {
    const host = {awaitConfirmation: vi.fn(async () => true)}
    const hook = createPolicyHook(host)
    await hook(ctx, {id: "c1", type: "function", function: {name: "delete_task", arguments: '{"task_id":"abc"}'}})
    expect(host.awaitConfirmation).toHaveBeenCalledWith("delete_task", {task_id: "abc"})
  })

  it("treats unparseable arguments as an empty object", async () => {
    const host = {awaitConfirmation: vi.fn(async () => true)}
    const hook = createPolicyHook(host)
    await hook(ctx, {id: "c1", type: "function", function: {name: "delete_task", arguments: "not-json"}})
    expect(host.awaitConfirmation).toHaveBeenCalledWith("delete_task", {})
  })
})
