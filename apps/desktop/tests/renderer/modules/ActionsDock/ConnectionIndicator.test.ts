// @vitest-environment happy-dom
// @ts-nocheck
import {createPinia, setActivePinia} from "pinia"
import {afterEach, beforeEach, describe, expect, it, vi} from "vitest"

import {mount} from "@vue/test-utils"
import {mockBridgeIPC} from "../../../helpers/bridgeIPC"
import {makeBinding} from "../../../helpers/syncServerFixtures"

describe("ConnectionIndicator — the dock tells when the sync server stops and starts answering", () => {
  let wrapper = null
  let bridge = null

  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    wrapper?.unmount()
    wrapper = null
    vi.useRealTimers()
  })

  async function setup({provider = "server", isReachable = false} = {}) {
    bridge = mockBridgeIPC({
      "settings:load": vi.fn().mockResolvedValue({
        sync: {iCloud: {enabled: provider === "icloud"}, server: {enabled: provider === "server", binding: makeBinding()}},
        branch: {activeId: "main"},
      }),
      "sync-server:get-state": vi.fn().mockResolvedValue({binding: makeBinding(), revoked: false, mismatch: null, isReachable}),
      "sync-server:on-revoked": vi.fn(),
      "sync-server:on-protocol-mismatch-changed": vi.fn(),
      "sync-server:on-role-changed": vi.fn(),
      "sync-server:on-agents-accepted-changed": vi.fn(),
      "sync-server:on-reachability-changed": vi.fn(),
      "sync-server:list-membership": vi.fn().mockResolvedValue({devices: [], enrollmentWindow: null}),
      "sync-server:list-agents": vi.fn().mockResolvedValue({agents: [], agentWindow: null}),
    })
    setActivePinia(createPinia())

    const {default: ConnectionIndicator} = await import("../../../../src/renderer/src/ui/modules/ActionsDock/{fragments}/ConnectionIndicator.vue")
    wrapper = mount(ConnectionIndicator, {global: {directives: {tooltip: {}}}})
    await settle()
  }

  async function settle() {
    await vi.advanceTimersByTimeAsync(0)
    await wrapper.vm.$nextTick()
  }

  function reachabilityListener() {
    return bridge["sync-server:on-reachability-changed"].mock.calls[0][0]
  }

  it("shows Reconnecting only while the server is the provider and does not answer", async () => {
    await setup({provider: "icloud", isReachable: false})
    expect(wrapper.text()).toBe("")

    await setup({provider: "server", isReachable: false})
    expect(wrapper.text()).toContain("Reconnecting…")
  })

  it("shows Reconnected on the answer after a silence, then clears it after two and a half seconds", async () => {
    await setup({isReachable: false})

    reachabilityListener()(true)
    await settle()
    expect(wrapper.text()).toContain("Reconnected")

    await vi.advanceTimersByTimeAsync(2499)
    expect(wrapper.text()).toContain("Reconnected")

    await vi.advanceTimersByTimeAsync(1)
    await settle()
    expect(wrapper.text()).toBe("")
  })

  it("asks main to retry the server when Try again is pressed", async () => {
    await setup({isReachable: false})

    await wrapper.find("button").trigger("click")

    expect(bridge["sync-server:retry"]).toHaveBeenCalledTimes(1)
  })
})
