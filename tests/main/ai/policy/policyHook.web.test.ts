// @ts-nocheck
import {describe, expect, it, vi} from "vitest"

import {LRU} from "@shared/utils/common/LRU"

import {describeToolCall} from "@main/ai/policy/describeToolCall"
import {createPolicyHook} from "@main/ai/policy/policyHook"

function call(name, args) {
  return {id: "c1", type: "function", function: {name, arguments: JSON.stringify(args)}}
}

describe("policy hook — external egress", () => {
  it("suspends read_url on confirmation and passes when confirmed", async () => {
    const host = {awaitConfirmation: vi.fn(async () => true), isEgressAutoApproved: () => false, getWebPageCache: () => new LRU(4, 60_000)}
    const hook = createPolicyHook(host)
    const decision = await hook({}, call("read_url", {url: "https://example.com"}))
    expect(host.awaitConfirmation).toHaveBeenCalled()
    expect(decision.action).toBe("pass")
  })

  it("skips read_url when the user declines", async () => {
    const host = {awaitConfirmation: vi.fn(async () => false), isEgressAutoApproved: () => false, getWebPageCache: () => new LRU(4, 60_000)}
    const hook = createPolicyHook(host)
    const decision = await hook({}, call("read_url", {url: "https://example.com"}))
    expect(decision.action).toBe("skip")
  })

  it("auto-approves read_url without confirmation when enabled", async () => {
    const host = {awaitConfirmation: vi.fn(async () => true), isEgressAutoApproved: () => true, getWebPageCache: () => new LRU(4, 60_000)}
    const hook = createPolicyHook(host)
    const decision = await hook({}, call("read_url", {url: "https://example.com"}))
    expect(host.awaitConfirmation).not.toHaveBeenCalled()
    expect(decision.action).toBe("pass")
  })

  it("skips confirmation when read_url will be served from cache (no egress)", async () => {
    const cache = new LRU(4, 60_000)
    cache.set("https://cached.example/", {finalUrl: "https://cached.example/", title: null, text: "x", served: 0})
    const host = {awaitConfirmation: vi.fn(async () => true), isEgressAutoApproved: () => false, getWebPageCache: () => cache}
    const hook = createPolicyHook(host)
    const decision = await hook({}, call("read_url", {url: "https://cached.example/"}))
    expect(host.awaitConfirmation).not.toHaveBeenCalled()
    expect(decision.action).toBe("pass")
  })

  it("does not gate a read-only tool", async () => {
    const host = {awaitConfirmation: vi.fn(async () => true), isEgressAutoApproved: () => false}
    const hook = createPolicyHook(host)
    const decision = await hook({}, call("get_task", {task_id: "x"}))
    expect(host.awaitConfirmation).not.toHaveBeenCalled()
    expect(decision.action).toBe("pass")
  })
})

describe("describeToolCall — read_url", () => {
  it("shows the host in the summary and the full URL in details", () => {
    const d = describeToolCall("read_url", {url: "https://example.com/x?d=secret"})
    expect(d.title).toMatch(/web page/i)
    expect(d.summary).toContain("example.com")
    expect(d.details?.[0]).toContain("https://example.com/x?d=secret")
  })
})
