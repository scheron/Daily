// @ts-nocheck
import {describe, expect, it, vi} from "vitest"

import {createPolicyHook} from "@main/ai/policy/policyHook"

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
