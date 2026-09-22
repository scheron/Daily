// @vitest-environment happy-dom
// @ts-nocheck
import {defineComponent, h} from "vue"
import {createPinia, setActivePinia} from "pinia"
import {afterEach, beforeEach, describe, expect, it, vi} from "vitest"

import {toDateLabel} from "@daily/std"

import {mount} from "@vue/test-utils"
import {mockBridgeIPC} from "../../helpers/bridgeIPC"
import {makeAgent, makeBinding, makeDevice} from "../../helpers/syncServerFixtures"

describe("DeviceTable — agents hang under their Mac (TC-23, TC-24)", () => {
  let wrapper = null

  beforeEach(() => {
    vi.useFakeTimers()
    setActivePinia(createPinia())
  })

  afterEach(() => {
    wrapper?.unmount()
    wrapper = null
    vi.useRealTimers()
  })

  async function setup(devices, seedAgents, bridgeOverrides = {}) {
    mockBridgeIPC({
      "sync-server:get-state": vi.fn().mockResolvedValue({binding: makeBinding(), revoked: false, mismatch: null}),
      "sync-server:on-revoked": vi.fn(),
      "sync-server:on-approval-requested": vi.fn(),
      "sync-server:get-pending-approval": vi.fn().mockResolvedValue(null),
      "sync-server:on-protocol-mismatch-changed": vi.fn(),
      "sync-server:on-role-changed": vi.fn(),
      "sync-server:on-agents-accepted-changed": vi.fn(),
      "sync-server:on-agent-requested": vi.fn(),
      "sync-server:get-pending-agent-request": vi.fn().mockResolvedValue(null),
      "sync-server:list-membership": vi.fn().mockResolvedValue({devices: [], enrollmentWindow: null}),
      "sync-server:list-agents": vi.fn().mockResolvedValue({agents: seedAgents, agentWindow: null}),
      "sync-server:revoke-agent": vi.fn(),
      ...bridgeOverrides,
    })

    const {default: DeviceTable} =
      await import("../../../src/renderer/src/ui/views/Settings/{fragments}/SyncSettings/{fragments}/ServerDetails/{fragments}/DeviceTable.vue")
    const {useSyncServerStore} = await import("../../../src/renderer/src/stores/syncServer.store")

    const Host = defineComponent({
      setup() {
        const syncServerStore = useSyncServerStore()
        return () => h(DeviceTable, {devices, agents: syncServerStore.agents})
      },
    })

    wrapper = mount(Host)
    await vi.advanceTimersByTimeAsync(0)
    await wrapper.vm.$nextTick()
  }

  it("renders_TC-23_each_agent_directly_under_its_own_mac_in_the_order_given_with_no_revoked_device_in_the_fixture", async () => {
    const fiveMinAgo = new Date(Date.now() - 5 * 60_000).toISOString()
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60_000).toISOString()

    const agentA1 = makeAgent({id: "a1", deviceId: "dev-p", name: "Claude Code", lastUsedAt: null, connectedAt: "2026-09-01T00:00:00.000Z"})
    const agentB1 = makeAgent({id: "b1", deviceId: "dev-c", name: "Codex", lastUsedAt: fiveMinAgo, connectedAt: "2026-09-05T00:00:00.000Z"})
    const agentA2 = makeAgent({id: "a2", deviceId: "dev-p", name: "Claude", lastUsedAt: twoHoursAgo, connectedAt: "2026-09-10T00:00:00.000Z"})

    const deviceP = makeDevice({id: "dev-p", name: "Gate Mac", isThisMac: true})
    const deviceC = makeDevice({id: "dev-c", name: "Mac mini", isThisMac: false})

    await setup([deviceP, deviceC], [agentA1, agentB1, agentA2])

    expect(wrapper.find("th").text()).toBe("Device · agent")

    const rows = wrapper.findAll("tr").slice(1)
    expect(rows).toHaveLength(5)
    expect(rows[0].find("td").text()).toContain("Gate Mac")
    expect(rows[1].find("td").text()).toContain("Claude Code")
    expect(rows[2].find("td").text()).toContain("Claude")
    expect(rows[3].find("td").text()).toContain("Mac mini")
    expect(rows[4].find("td").text()).toContain("Codex")

    expect(rows[1].text()).toContain("—")
    expect(rows[2].text()).toContain("2h ago")
    expect(rows[4].text()).toContain("5m ago")

    const text = wrapper.text()
    expect(text).toContain(toDateLabel(agentA1.connectedAt, {short: true}))
    expect(text).toContain(toDateLabel(agentB1.connectedAt, {short: true}))
    expect(text).toContain(toDateLabel(agentA2.connectedAt, {short: true}))
    expect(text).not.toContain("Revoked")

    const agentRows = wrapper.findAll("tr").filter((row) => row.text().includes("↳"))
    expect(agentRows).toHaveLength(3)
    for (const row of agentRows) {
      expect(row.text()).not.toContain("This Mac")
      expect(row.text()).not.toContain("Revoked")
    }
  })

  it("revokes_TC-24_the_agent_from_its_own_row_after_the_popup_is_confirmed_by_click", async () => {
    const agentA1 = makeAgent({id: "a1", deviceId: "dev-p", name: "Claude Code"})
    const agentA2 = makeAgent({id: "a2", deviceId: "dev-p", name: "Claude"})
    const agentB1 = makeAgent({id: "b1", deviceId: "dev-c", name: "Codex"})
    const deviceP = makeDevice({id: "dev-p", name: "Gate Mac", isThisMac: true})
    const deviceC = makeDevice({id: "dev-c", name: "Mac mini", isThisMac: false})

    const revokeAgentMock = vi.fn().mockResolvedValue({agents: [agentA2, agentB1], agentWindow: null})

    await setup([deviceP, deviceC], [agentA1, agentA2, agentB1], {"sync-server:revoke-agent": revokeAgentMock})

    const a1Row = wrapper.findAll("tr").find((row) => row.text().includes("↳") && row.text().includes("Claude Code"))
    const triggerButton = a1Row.findAll("button").find((button) => button.text().trim() === "Revoke")
    await triggerButton.trigger("click")
    await wrapper.vm.$nextTick()

    const popupEl = document.body.querySelector("[data-popup]")
    const popupText = popupEl?.textContent ?? ""
    expect(popupText).toContain("Revoke this agent?")
    expect(popupText).toContain("It will lose access to Daily until it is connected again.")
    expect(popupText).toContain("Revoke")
    expect(popupText).toContain("Cancel")

    const confirmButton = Array.from(popupEl.querySelectorAll("button")).find((button) => button.textContent?.trim() === "Revoke")
    confirmButton?.dispatchEvent(new Event("click", {bubbles: true}))
    await vi.advanceTimersByTimeAsync(0)
    await wrapper.vm.$nextTick()

    expect(revokeAgentMock).toHaveBeenCalledWith("a1")

    const remainingAgentRows = wrapper.findAll("tr").filter((row) => row.text().includes("↳"))
    expect(remainingAgentRows).toHaveLength(2)
    expect(wrapper.text()).not.toContain("Claude Code")
    expect(wrapper.text()).toContain("Claude")
    expect(wrapper.text()).toContain("Codex")
  })
})
