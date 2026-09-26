// @vitest-environment happy-dom
// @ts-nocheck
import {createPinia, setActivePinia} from "pinia"
import {afterEach, describe, expect, it, vi} from "vitest"

import {mount} from "@vue/test-utils"
import {mockBridgeIPC} from "../../helpers/bridgeIPC"
import {makeBinding} from "../../helpers/syncServerFixtures"

describe("ServerHero — a server that stops answering", () => {
  let wrapper = null

  afterEach(() => {
    wrapper?.unmount()
    wrapper = null
  })

  it("reads Reconnecting over a sync error, and Try again asks main to retry", async () => {
    const bridge = mockBridgeIPC({
      "storage-sync:get-status": vi.fn().mockResolvedValue("error"),
      "storage-sync:get-remote-states": vi
        .fn()
        .mockResolvedValue([{id: "daily-server", label: "Server", lastSyncAt: null, lastError: "fetch failed"}]),
      "sync-server:get-state": vi.fn().mockResolvedValue({binding: makeBinding(), revoked: false, mismatch: null, isReachable: false}),
      "sync-server:on-revoked": vi.fn(),
      "sync-server:on-protocol-mismatch-changed": vi.fn(),
      "sync-server:on-role-changed": vi.fn(),
      "sync-server:on-agents-accepted-changed": vi.fn(),
      "sync-server:list-membership": vi.fn().mockResolvedValue({devices: [], enrollmentWindow: null}),
      "sync-server:list-agents": vi.fn().mockResolvedValue({agents: [], agentWindow: null}),
    })
    setActivePinia(createPinia())

    const {default: ServerHero} =
      await import("../../../src/renderer/src/ui/views/Settings/{fragments}/SyncSettings/{fragments}/ServerDetails/{fragments}/ServerHero.vue")
    wrapper = mount(ServerHero, {props: {binding: makeBinding()}, global: {directives: {tooltip: {}}}})
    await new Promise((r) => setTimeout(r, 0))
    await wrapper.vm.$nextTick()

    expect(wrapper.text()).toContain("Reconnecting…")
    expect(wrapper.text()).not.toContain("Sync error")

    await wrapper
      .findAll("button")
      .find((button) => button.text().trim() === "Try again")
      .trigger("click")

    expect(bridge["sync-server:retry"]).toHaveBeenCalledTimes(1)
  })
})
