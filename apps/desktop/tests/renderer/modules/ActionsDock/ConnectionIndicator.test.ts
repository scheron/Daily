// @vitest-environment happy-dom
// @ts-nocheck
import {createPinia, setActivePinia} from "pinia"
import {afterEach, beforeEach, describe, expect, it, vi} from "vitest"

import {mount} from "@vue/test-utils"
import {mockBridgeIPC} from "../../../helpers/bridgeIPC"
import {makeBinding} from "../../../helpers/syncServerFixtures"

describe("ConnectionIndicator — the dock tells when the sync server is being reached, answers, and stops answering", () => {
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

  async function setup({provider = "server", connection = "unreachable"} = {}) {
    bridge = mockBridgeIPC({
      "settings:load": vi.fn().mockResolvedValue({
        sync: {iCloud: {enabled: provider === "icloud"}, server: {enabled: provider === "server", binding: makeBinding()}},
        branch: {activeId: "main"},
      }),
      "sync-server:get-state": vi.fn().mockResolvedValue({binding: makeBinding(), revoked: false, mismatch: null, connection}),
      "sync-server:on-revoked": vi.fn(),
      "sync-server:on-protocol-mismatch-changed": vi.fn(),
      "sync-server:on-role-changed": vi.fn(),
      "sync-server:on-agents-accepted-changed": vi.fn(),
      "sync-server:on-connection-changed": vi.fn(),
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

  function connectionListener() {
    return bridge["sync-server:on-connection-changed"].mock.calls[0][0]
  }

  it("shows nothing while another provider syncs", async () => {
    await setup({provider: "icloud", connection: "unreachable"})

    expect(wrapper.text()).toBe("")
  })

  it("shows Connecting until the first answer, then Connected for two and a half seconds", async () => {
    await setup({connection: "connecting"})
    expect(wrapper.text()).toContain("Connecting…")

    connectionListener()("connected")
    await settle()
    expect(wrapper.text()).toContain("Connected")

    await vi.advanceTimersByTimeAsync(2499)
    expect(wrapper.text()).toContain("Connected")

    await vi.advanceTimersByTimeAsync(1)
    await settle()
    expect(wrapper.text()).toBe("")
  })

  it("shows Connected when the app opens on a server that already answered", async () => {
    await setup({connection: "connected"})

    expect(wrapper.text()).toContain("Connected")

    await vi.advanceTimersByTimeAsync(2500)
    await settle()
    expect(wrapper.text()).toBe("")
  })

  it("shows Reconnecting while the server does not answer, and Reconnected on the answer after it", async () => {
    await setup({connection: "unreachable"})
    expect(wrapper.text()).toContain("Reconnecting…")

    connectionListener()("connected")
    await settle()
    expect(wrapper.text()).toContain("Reconnected")

    await vi.advanceTimersByTimeAsync(2500)
    await settle()
    expect(wrapper.text()).toBe("")
  })

  it("asks main to retry the server when Try again is pressed", async () => {
    await setup({connection: "unreachable"})

    await wrapper.find("button").trigger("click")

    expect(bridge["sync-server:retry"]).toHaveBeenCalledTimes(1)
  })
})
