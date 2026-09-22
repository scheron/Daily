// @vitest-environment happy-dom
// @ts-nocheck
import {createPinia, setActivePinia} from "pinia"
import {afterEach, describe, expect, it, vi} from "vitest"

import {toDateLabel} from "@daily/std"

import {mount} from "@vue/test-utils"
import {mockBridgeIPC} from "../../helpers/bridgeIPC"
import {makeAgent, makeBinding, makeDevice} from "../../helpers/syncServerFixtures"

describe("ServerDetails — no revoked device rendered, the row or the line, by role and by the accepts-agents fact (TC-47, TC-25 to TC-29)", () => {
  let wrapper = null
  let bridge = null

  afterEach(() => {
    wrapper?.unmount()
    wrapper = null
    bridge = null
  })

  async function setup(state, bridgeOverrides = {}) {
    wrapper?.unmount()

    bridge = mockBridgeIPC({
      "sync-server:get-state": vi.fn().mockResolvedValue({binding: state.binding, revoked: state.revoked ?? false, mismatch: state.mismatch ?? null}),
      "sync-server:on-revoked": vi.fn(),
      "sync-server:on-approval-requested": vi.fn(),
      "sync-server:get-pending-approval": vi.fn().mockResolvedValue(null),
      "sync-server:on-protocol-mismatch-changed": vi.fn(),
      "sync-server:on-role-changed": vi.fn(),
      "sync-server:on-agents-accepted-changed": vi.fn(),
      "sync-server:on-agent-requested": vi.fn(),
      "sync-server:get-pending-agent-request": vi.fn().mockResolvedValue(null),
      "sync-server:list-membership": vi.fn().mockResolvedValue({devices: state.devices ?? [], enrollmentWindow: null}),
      "sync-server:list-agents": vi.fn().mockResolvedValue({agents: state.agents ?? [], agentWindow: null}),
      "sync-server:open-agent-window": vi.fn(),
      "sync-server:close-agent-window": vi.fn(),
      "sync-server:revoke-agent": vi.fn(),
      "sync-server:revoke-device": vi.fn(),
      ...bridgeOverrides,
    })

    setActivePinia(createPinia())

    const {default: ServerDetails} =
      await import("../../../src/renderer/src/ui/views/Settings/{fragments}/SyncSettings/{fragments}/ServerDetails/ServerDetails.vue")

    wrapper = mount(ServerDetails)
    await new Promise((r) => setTimeout(r, 0))
    await wrapper.vm.$nextTick()
  }

  function actionButtons() {
    return wrapper
      .findAll("button")
      .map((button) => button.text().trim())
      .filter((label) => label === "Add a device" || label === "Connect an agent")
  }

  it("renders_TC-47_no_revoked_mac_of_either_role_and_no_revoked_pill", async () => {
    await setup({
      binding: makeBinding({role: "parent"}),
      revoked: false,
      devices: [
        makeDevice({id: "dev-p", name: "Gate Mac", isThisMac: true}),
        makeDevice({id: "dev-air", name: "MacBook Air", role: "child", isThisMac: false}),
        makeDevice({id: "dev-imac", name: "Old iMac", role: "child", isThisMac: false, revokedAt: "2026-09-10T00:00:00.000Z"}),
        makeDevice({id: "dev-pro", name: "Old Mac Pro", role: "parent", isThisMac: false, revokedAt: "2026-09-11T00:00:00.000Z"}),
      ],
      agents: [],
    })

    const text = wrapper.text()
    expect(text).toContain("MacBook Air")
    expect(text).not.toContain("Old iMac")
    expect(text).not.toContain("Old Mac Pro")
    expect(text).not.toContain("Revoked")
  })

  it("orders_TC-25_the_device_table_then_one_action_row_holding_add_a_device_and_connect_an_agent_in_that_order", async () => {
    await setup({
      binding: makeBinding({role: "parent", acceptsAgents: true}),
      revoked: false,
      devices: [makeDevice({id: "dev-p", name: "Gate Mac", isThisMac: true}), makeDevice({id: "dev-c", name: "Mac mini", isThisMac: false})],
      agents: [makeAgent({id: "a1", deviceId: "dev-p", name: "Claude Code"})],
    })

    const text = wrapper.text()
    const deviceTableIndex = text.indexOf("Claude Code")
    const addDeviceIndex = text.indexOf("Add a device")

    expect(deviceTableIndex).toBeGreaterThan(-1)
    expect(addDeviceIndex).toBeGreaterThan(deviceTableIndex)
    expect(actionButtons()).toEqual(["Add a device", "Connect an agent"])
    expect(text).not.toContain("Agents need this server on a domain with a trusted certificate.")
  })

  it("shows_TC-26_the_domain_line_instead_of_the_connect_button_for_both_a_parent_and_a_child_that_cannot_accept_agents", async () => {
    await setup({binding: makeBinding({role: "parent", acceptsAgents: false}), revoked: false, devices: [], agents: []})
    expect(wrapper.text()).toContain("Agents need this server on a domain with a trusted certificate.")
    expect(actionButtons()).toEqual(["Add a device"])

    await setup({binding: makeBinding({role: "child", acceptsAgents: false}), revoked: false, devices: [], agents: []})
    expect(wrapper.text()).toContain("Agents need this server on a domain with a trusted certificate.")
    expect(actionButtons()).toEqual([])
    expect(wrapper.text()).not.toContain("Add a device")
  })

  it("shows_TC-27_neither_the_connect_button_nor_the_domain_line_when_the_fact_is_unknown_revoked_or_the_role_is_unresolved", async () => {
    await setup({binding: makeBinding({acceptsAgents: null}), revoked: false, devices: [], agents: []})
    expect(wrapper.text()).not.toContain("Agents need this server on a domain with a trusted certificate.")
    expect(actionButtons()).toEqual(["Add a device"])

    await setup({binding: makeBinding({acceptsAgents: true}), revoked: true, devices: [], agents: []})
    expect(wrapper.text()).not.toContain("Connect an agent")
    expect(wrapper.text()).not.toContain("Agents need this server on a domain with a trusted certificate.")

    await setup({binding: makeBinding({acceptsAgents: true, role: null}), revoked: false, devices: [], agents: []})
    expect(wrapper.text()).toContain("Checking this Mac's role…")
    expect(wrapper.text()).not.toContain("Connect an agent")
    expect(wrapper.text()).not.toContain("Agents need this server on a domain with a trusted certificate.")
  })

  it("shows_TC-28_connected_the_this_mac_table_its_own_agent_and_an_action_row_holding_only_connect_an_agent_for_a_child", async () => {
    await setup({
      binding: makeBinding({role: "child", deviceName: "MacBook Air", boundAt: "2026-09-03T00:00:00.000Z", acceptsAgents: true}),
      revoked: false,
      devices: [],
      agents: [makeAgent({id: "claude-1", deviceId: "dev-1", name: "Claude"})],
    })

    const text = wrapper.text()
    expect(text).toContain("Connected")
    expect(text).toContain("This Mac · agents")
    expect(text).toContain("Last used")
    expect(text).toContain("Added")
    const macRow = wrapper.find("table tbody tr")
    expect(macRow.text()).toContain("MacBook Air")
    expect(macRow.text()).toContain("This Mac")
    expect(macRow.text()).toContain("just now")
    expect(macRow.text()).toContain(toDateLabel("2026-09-03T00:00:00.000Z", {short: true}))
    expect(text).toContain("Claude")
    expect(text).not.toContain("Device · agent")
    expect(text).not.toContain("Add a device")
    expect(actionButtons()).toEqual(["Connect an agent"])

    const claudeIndex = text.indexOf("Claude")
    const connectRowIndex = text.indexOf("Connect an agent")
    expect(connectRowIndex).toBeGreaterThan(claudeIndex)
  })

  it("swaps_TC-29_the_connect_button_and_the_domain_line_live_on_the_broadcast_without_a_remount", async () => {
    await setup({binding: makeBinding({acceptsAgents: true}), revoked: false, devices: [], agents: []})

    expect(actionButtons()).toContain("Connect an agent")

    const acceptedListener = bridge["sync-server:on-agents-accepted-changed"].mock.calls[0][0]
    acceptedListener(false)
    await wrapper.vm.$nextTick()

    expect(wrapper.text()).toContain("Agents need this server on a domain with a trusted certificate.")
    expect(actionButtons()).not.toContain("Connect an agent")
    expect(bridge["sync-server:get-state"]).toHaveBeenCalledTimes(1)

    acceptedListener(true)
    await wrapper.vm.$nextTick()

    expect(actionButtons()).toContain("Connect an agent")
    expect(wrapper.text()).not.toContain("Agents need this server on a domain with a trusted certificate.")
  })
})
