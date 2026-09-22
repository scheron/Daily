// @ts-nocheck
import {createPinia, setActivePinia} from "pinia"
import {beforeEach, describe, expect, it, vi} from "vitest"

import {mockBridgeIPC} from "../../helpers/bridgeIPC"
import {makeAgent, makeAgentWindow, makeBinding, makeDevice} from "../../helpers/syncServerFixtures"

vi.mock("../../../src/renderer/src/utils/ui/toRawDeep", () => ({toRawDeep: (v) => v}))

const MISMATCH_CHANNEL = "sync-server:on-protocol-mismatch-changed"

function bridgeWithState(mismatch: {appProtocol: number; serverProtocol: number} | null = null) {
  return mockBridgeIPC({
    "sync-server:get-state": vi.fn().mockResolvedValue({binding: null, revoked: false, mismatch}),
    "sync-server:on-revoked": vi.fn(),
    "sync-server:on-approval-requested": vi.fn(),
    [MISMATCH_CHANNEL]: vi.fn(),
    "sync-server:on-role-changed": vi.fn(),
    "sync-server:on-agents-accepted-changed": vi.fn(),
  })
}

describe("syncServerStore — the mismatch flag reaches the renderer without reopening Settings (TC-9, TC-11)", () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  async function getStore() {
    const {useSyncServerStore} = await import("../../../src/renderer/src/stores/syncServer.store")
    const store = useSyncServerStore()
    await new Promise((r) => setTimeout(r, 0))
    return store
  }

  function capturedMismatchListener(bridge: ReturnType<typeof bridgeWithState>): (mismatch: unknown) => void {
    expect(bridge[MISMATCH_CHANNEL], `expected the store to subscribe to ${MISMATCH_CHANNEL} on creation`).toHaveBeenCalledTimes(1)
    return bridge[MISMATCH_CHANNEL].mock.calls[0][0]
  }

  it("subscribes_TC-9_to_the_mismatch_channel_on_creation_so_a_later_broadcast_needs_no_reopen", async () => {
    const bridge = bridgeWithState(null)
    await getStore()

    const listener = capturedMismatchListener(bridge)
    expect(typeof listener).toBe("function")
  })

  it("reflects_TC-9_a_mismatch_the_moment_the_subscribed_callback_fires_naming_both_versions", async () => {
    const bridge = bridgeWithState(null)
    const store = await getStore()

    expect(store.mismatch).toBeNull()
    expect(bridge["sync-server:get-state"]).toHaveBeenCalledTimes(1)

    capturedMismatchListener(bridge)({appProtocol: 2, serverProtocol: 1})

    expect(store.mismatch).toEqual({appProtocol: 2, serverProtocol: 1})
    expect(bridge["sync-server:get-state"]).toHaveBeenCalledTimes(1)
  })

  it("clears_TC-11_the_mismatch_on_its_own_the_moment_the_subscribed_callback_reports_it_gone", async () => {
    const bridge = bridgeWithState(null)
    const store = await getStore()

    const listener = capturedMismatchListener(bridge)
    listener({appProtocol: 2, serverProtocol: 1})
    expect(store.mismatch).not.toBeNull()

    listener(null)

    expect(store.mismatch).toBeNull()
  })
})

const ROLE_CHANGED_CHANNEL = "sync-server:on-role-changed"
const LIST_MEMBERSHIP_CHANNEL = "sync-server:list-membership"

function bridgeWithChildBinding() {
  return mockBridgeIPC({
    "sync-server:get-state": vi.fn().mockResolvedValue({
      binding: {
        baseUrl: "http://127.0.0.1:8787",
        serverId: "srv-1",
        serverName: "Home Server",
        deviceId: "dev-1",
        deviceName: "MacBook Air",
        fingerprint: null,
        insecure: true,
        boundAt: "2026-08-10T00:00:00.000Z",
        role: "child",
        approvedBy: "Mac mini",
      },
      revoked: false,
      mismatch: null,
    }),
    "sync-server:on-revoked": vi.fn(),
    "sync-server:on-approval-requested": vi.fn(),
    [MISMATCH_CHANNEL]: vi.fn(),
    [ROLE_CHANGED_CHANNEL]: vi.fn(),
    [LIST_MEMBERSHIP_CHANNEL]: vi.fn().mockResolvedValue({devices: [], enrollmentWindow: null}),
    "sync-server:on-agents-accepted-changed": vi.fn(),
    "sync-server:list-agents": vi.fn().mockResolvedValue({agents: [], agentWindow: null}),
  })
}

describe("syncServerStore — a role learned on the tick updates the store and reloads membership without reopening Settings (TC-17)", () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  async function getStore() {
    const {useSyncServerStore} = await import("../../../src/renderer/src/stores/syncServer.store")
    const store = useSyncServerStore()
    await new Promise((r) => setTimeout(r, 0))
    return store
  }

  function capturedRoleListener(bridge: ReturnType<typeof bridgeWithChildBinding>): (role: string) => void {
    expect(bridge[ROLE_CHANGED_CHANNEL], `expected the store to subscribe to ${ROLE_CHANGED_CHANNEL} on creation`).toHaveBeenCalledTimes(1)
    return bridge[ROLE_CHANGED_CHANNEL].mock.calls[0][0]
  }

  it("reflects_TC-17_the_new_role_and_reloads_membership_the_moment_the_subscribed_callback_fires", async () => {
    const bridge = bridgeWithChildBinding()
    const store = await getStore()

    expect(store.binding?.role).toBe("child")
    expect(bridge[LIST_MEMBERSHIP_CHANNEL]).not.toHaveBeenCalled()

    capturedRoleListener(bridge)("parent")

    expect(store.binding?.role).toBe("parent")
    expect(bridge[LIST_MEMBERSHIP_CHANNEL]).toHaveBeenCalledTimes(1)
  })
})

const AGENTS_ACCEPTED_CHANNEL = "sync-server:on-agents-accepted-changed"
const AGENT_REQUESTED_CHANNEL = "sync-server:on-agent-requested"

function makeAgentRequest(overrides = {}) {
  return {
    requestId: "req-1",
    code: "482913",
    agentName: "Claude Code",
    returnsTo: "localhost",
    isLocalProgram: true,
    requestedAt: "2026-09-21T00:00:00.000Z",
    expiresAt: "2026-09-21T00:05:00.000Z",
    ...overrides,
  }
}

function bridgeForAgents(overrides = {}) {
  return mockBridgeIPC({
    "sync-server:get-state": vi.fn().mockResolvedValue({binding: makeBinding(), revoked: false, mismatch: null}),
    "sync-server:on-revoked": vi.fn(),
    "sync-server:on-approval-requested": vi.fn(),
    "sync-server:get-pending-approval": vi.fn().mockResolvedValue(null),
    [MISMATCH_CHANNEL]: vi.fn(),
    "sync-server:on-role-changed": vi.fn(),
    [AGENTS_ACCEPTED_CHANNEL]: vi.fn(),
    [AGENT_REQUESTED_CHANNEL]: vi.fn(),
    "sync-server:list-membership": vi.fn().mockResolvedValue({devices: [], enrollmentWindow: null}),
    "sync-server:list-agents": vi.fn().mockResolvedValue({agents: [], agentWindow: null}),
    "sync-server:revoke-device": vi.fn().mockResolvedValue({devices: [], enrollmentWindow: null}),
    "sync-server:revoke-agent": vi.fn().mockResolvedValue({agents: [], agentWindow: null}),
    "sync-server:open-agent-window": vi.fn(),
    "sync-server:close-agent-window": vi.fn(),
    "sync-server:get-pending-agent-request": vi.fn().mockResolvedValue(null),
    "sync-server:approve-agent": vi.fn().mockResolvedValue(undefined),
    "sync-server:deny-agent": vi.fn().mockResolvedValue(undefined),
    ...overrides,
  })
}

function flush() {
  return new Promise((r) => setTimeout(r, 0))
}

describe("syncServerStore — the agent list, the agent card and revoking an agent (TC-1 to TC-8)", () => {
  beforeEach(async () => {
    setActivePinia(createPinia())
    const {useBaseModal} = await import("../../../src/renderer/src/ui/base/BaseModal")
    useBaseModal().stack.value = []
  })

  async function getStore() {
    const {useSyncServerStore} = await import("../../../src/renderer/src/stores/syncServer.store")
    const store = useSyncServerStore()
    await flush()
    return store
  }

  async function agentCardItems() {
    const {useBaseModal} = await import("../../../src/renderer/src/ui/base/BaseModal")
    return useBaseModal().stack.value.filter((item) => item.props && "deviceName" in item.props)
  }

  it("reflects_TC-1_the_accepts-agents_broadcast_live_without_a_reload", async () => {
    const bridge = bridgeForAgents({
      "sync-server:get-state": vi.fn().mockResolvedValue({binding: makeBinding({acceptsAgents: true}), revoked: false, mismatch: null}),
    })
    const store = await getStore()

    expect(store.binding?.acceptsAgents).toBe(true)
    expect(bridge[AGENTS_ACCEPTED_CHANNEL]).toHaveBeenCalledTimes(1)
    const listener = bridge[AGENTS_ACCEPTED_CHANNEL].mock.calls[0][0]

    listener(false)
    expect(store.binding?.acceptsAgents).toBe(false)

    listener(true)
    expect(store.binding?.acceptsAgents).toBe(true)

    expect(bridge["sync-server:get-state"]).toHaveBeenCalledTimes(1)
  })

  it("loads_TC-2_the_agent_list_and_window_for_both_a_parent_and_a_child_leaving_revoked_agents_out_and_keeping_order", async () => {
    const agentA = makeAgent({id: "agent-a", deviceId: "dev-p", name: "Claude Code"})
    const agentB = makeAgent({id: "agent-b", deviceId: "dev-c", name: "Codex"})
    const agentR = makeAgent({id: "agent-r", deviceId: "dev-p", name: "Claude", revokedAt: "2026-09-10T00:00:00.000Z"})
    const window = makeAgentWindow()

    for (const role of ["parent", "child"] as const) {
      setActivePinia(createPinia())
      const bridge = bridgeForAgents({
        "sync-server:get-state": vi.fn().mockResolvedValue({binding: makeBinding({role}), revoked: false, mismatch: null}),
        "sync-server:list-agents": vi.fn().mockResolvedValue({agents: [agentA, agentB, agentR], agentWindow: window}),
      })
      const store = await getStore()

      expect(bridge["sync-server:list-agents"]).toHaveBeenCalledTimes(1)
      expect(store.agents.map((agent) => agent.id)).toEqual(["agent-a", "agent-b"])
      expect(store.agentWindow).toEqual(window)
    }
  })

  it("loads_TC-3_no_agents_when_there_is_no_binding_a_revoked_one_or_a_protocol_mismatch", async () => {
    const cases = [
      {binding: null, revoked: false, mismatch: null},
      {binding: makeBinding(), revoked: true, mismatch: null},
      {binding: makeBinding(), revoked: false, mismatch: {appProtocol: 2, serverProtocol: 1}},
    ]

    for (const state of cases) {
      setActivePinia(createPinia())
      const bridge = bridgeForAgents({"sync-server:get-state": vi.fn().mockResolvedValue(state)})
      const store = await getStore()

      expect(bridge["sync-server:list-agents"]).not.toHaveBeenCalled()
      expect(store.agents).toEqual([])
      expect(store.agentWindow).toBeNull()
    }
  })

  it("reloads_TC-4_the_agent_list_when_this_macs_role_changes", async () => {
    const initialAgents = [makeAgent({id: "agent-old"})]
    const changedAgents = [makeAgent({id: "agent-new", name: "Codex"})]
    let listAgentsCalls = 0
    const bridge = bridgeForAgents({
      "sync-server:get-state": vi.fn().mockResolvedValue({binding: makeBinding({role: "child"}), revoked: false, mismatch: null}),
      "sync-server:list-agents": vi.fn().mockImplementation(() => {
        listAgentsCalls += 1
        return Promise.resolve({agents: listAgentsCalls === 1 ? initialAgents : changedAgents, agentWindow: null})
      }),
    })
    const store = await getStore()

    expect(store.agents.map((agent) => agent.id)).toEqual(["agent-old"])
    expect(bridge["sync-server:list-agents"]).toHaveBeenCalledTimes(1)

    const roleListener = bridge["sync-server:on-role-changed"].mock.calls[0][0]
    roleListener("parent")
    await flush()

    expect(bridge["sync-server:list-agents"]).toHaveBeenCalledTimes(2)
    expect(store.agents.map((agent) => agent.id)).toEqual(["agent-new"])
  })

  it("re-reads_TC-5_the_agent_list_after_revoking_a_mac_so_its_agents_leave_the_table_with_it", async () => {
    const agentX = makeAgent({id: "agent-x", deviceId: "dev-c", name: "Claude"})
    const callOrder: string[] = []
    let listAgentsCalls = 0
    bridgeForAgents({
      "sync-server:get-state": vi.fn().mockResolvedValue({binding: makeBinding(), revoked: false, mismatch: null}),
      "sync-server:list-agents": vi.fn().mockImplementation(() => {
        listAgentsCalls += 1
        callOrder.push("list-agents")
        return Promise.resolve(listAgentsCalls === 1 ? {agents: [agentX], agentWindow: null} : {agents: [], agentWindow: null})
      }),
      "sync-server:revoke-device": vi.fn().mockImplementation(() => {
        callOrder.push("revoke-device")
        return Promise.resolve({devices: [], enrollmentWindow: null})
      }),
    })
    const store = await getStore()
    expect(store.agents.map((agent) => agent.id)).toEqual(["agent-x"])
    expect(callOrder).toEqual(["list-agents"])

    await store.revokeDevice("dev-c")

    expect(callOrder).toEqual(["list-agents", "revoke-device", "list-agents"])
    expect(store.agents).toEqual([])
  })

  it("applies_TC-6_the_servers_answer_after_revoking_a_single_agent_and_resolves_to_it", async () => {
    const agentX = makeAgent({id: "agent-x", name: "Claude Code"})
    const agentY = makeAgent({id: "agent-y", name: "Codex"})
    const answer = {agents: [{...agentX, revokedAt: "2026-09-21T00:00:00.000Z"}, agentY], agentWindow: null}
    const bridge = bridgeForAgents({
      "sync-server:get-state": vi.fn().mockResolvedValue({binding: makeBinding(), revoked: false, mismatch: null}),
      "sync-server:list-agents": vi.fn().mockResolvedValue({agents: [agentX, agentY], agentWindow: null}),
      "sync-server:revoke-agent": vi.fn().mockResolvedValue(answer),
    })
    const store = await getStore()
    expect(store.agents.map((agent) => agent.id)).toEqual(["agent-x", "agent-y"])

    const result = await store.revokeAgent("agent-x")

    expect(bridge["sync-server:revoke-agent"]).toHaveBeenCalledWith("agent-x")
    expect(store.agents.map((agent) => agent.id)).toEqual(["agent-y"])
    expect(result).toEqual(answer)
  })

  it("puts_TC-7_up_exactly_one_agent_card_on_watchForApprovals_and_again_on_each_agent-requested_broadcast", async () => {
    const requestQ = makeAgentRequest({requestId: "req-q", code: "482913", agentName: "Claude Code", returnsTo: "localhost", isLocalProgram: true})
    const bridge = bridgeForAgents({
      "sync-server:get-state": vi.fn().mockResolvedValue({binding: makeBinding({deviceName: "Gate Mac"}), revoked: false, mismatch: null}),
      "sync-server:get-pending-agent-request": vi.fn().mockResolvedValue(requestQ),
    })
    const store = await getStore()

    store.watchForApprovals()
    await flush()

    let cards = await agentCardItems()
    expect(cards).toHaveLength(1)
    expect(cards[0].props.request).toEqual(requestQ)
    expect(cards[0].props.deviceName).toBe("Gate Mac")

    const requestedListener = bridge[AGENT_REQUESTED_CHANNEL].mock.calls[0][0]
    requestedListener()
    await flush()

    cards = await agentCardItems()
    expect(cards).toHaveLength(1)
    expect(bridge["sync-server:get-pending-agent-request"]).toHaveBeenCalledTimes(2)

    store.watchForApprovals()
    expect(bridge[AGENT_REQUESTED_CHANNEL]).toHaveBeenCalledTimes(1)
    expect(bridge["sync-server:get-pending-agent-request"]).toHaveBeenCalledTimes(2)
  })

  it("puts_TC-7_up_no_agent_card_when_nothing_is_waiting", async () => {
    const bridge = bridgeForAgents({
      "sync-server:get-state": vi.fn().mockResolvedValue({binding: makeBinding(), revoked: false, mismatch: null}),
      "sync-server:get-pending-agent-request": vi.fn().mockResolvedValue(null),
    })
    const store = await getStore()

    store.watchForApprovals()
    await flush()
    expect(await agentCardItems()).toHaveLength(0)

    const requestedListener = bridge[AGENT_REQUESTED_CHANNEL].mock.calls[0][0]
    requestedListener()
    await flush()
    expect(await agentCardItems()).toHaveLength(0)
  })

  it("re-reads_TC-43a_the_state_on_a_broadcast_and_shows_the_card_once_it_finds_a_binding", async () => {
    const requestQ = makeAgentRequest({requestId: "req-q", code: "482913", agentName: "Claude Code", returnsTo: "localhost", isLocalProgram: true})
    const bridge = bridgeForAgents({
      "sync-server:get-state": vi.fn().mockResolvedValue({binding: null, revoked: false, mismatch: null}),
      "sync-server:get-pending-agent-request": vi.fn().mockResolvedValue(requestQ),
    })
    const store = await getStore()
    expect(store.binding).toBeNull()

    store.watchForApprovals()
    await flush()

    const callsBeforeBroadcast = bridge["sync-server:get-state"].mock.calls.length
    bridge["sync-server:get-state"].mockResolvedValue({binding: makeBinding(), revoked: false, mismatch: null})

    const requestedListener = bridge[AGENT_REQUESTED_CHANNEL].mock.calls[0][0]
    requestedListener()
    await flush()

    expect(bridge["sync-server:get-state"].mock.calls.length).toBeGreaterThan(callsBeforeBroadcast)
    expect(store.binding?.deviceName).toBe("Gate Mac")

    const cards = await agentCardItems()
    expect(cards).toHaveLength(1)
    expect(cards[0].props.request).toEqual(requestQ)
    expect(cards[0].props.deviceName).toBe("Gate Mac")
  })

  it("re-reads_TC-43b_the_state_on_a_broadcast_but_shows_no_card_while_still_unbound", async () => {
    const requestQ = makeAgentRequest({requestId: "req-q", code: "482913", agentName: "Claude Code", returnsTo: "localhost", isLocalProgram: true})
    const bridge = bridgeForAgents({
      "sync-server:get-state": vi.fn().mockResolvedValue({binding: null, revoked: false, mismatch: null}),
      "sync-server:get-pending-agent-request": vi.fn().mockResolvedValue(requestQ),
    })
    const store = await getStore()

    store.watchForApprovals()
    await flush()

    const callsBeforeBroadcast = bridge["sync-server:get-state"].mock.calls.length

    const requestedListener = bridge[AGENT_REQUESTED_CHANNEL].mock.calls[0][0]
    requestedListener()
    await flush()

    expect(bridge["sync-server:get-state"].mock.calls.length).toBeGreaterThan(callsBeforeBroadcast)
    expect(store.binding).toBeNull()
    expect(await agentCardItems()).toHaveLength(0)
  })

  it("approves_TC-8a_an_agent_re-reads_the_list_and_closes_the_card", async () => {
    const requestQ = makeAgentRequest({requestId: "req-q", code: "482913"})
    const callOrder: string[] = []
    const bridge = bridgeForAgents({
      "sync-server:get-state": vi.fn().mockResolvedValue({binding: makeBinding(), revoked: false, mismatch: null}),
      "sync-server:get-pending-agent-request": vi.fn().mockResolvedValue(requestQ),
      "sync-server:approve-agent": vi.fn().mockImplementation(() => {
        callOrder.push("approve-agent")
        return Promise.resolve()
      }),
      "sync-server:list-agents": vi.fn().mockImplementation(() => {
        callOrder.push("list-agents")
        return Promise.resolve({agents: [], agentWindow: null})
      }),
    })
    const store = await getStore()
    store.watchForApprovals()
    await flush()

    const card = (await agentCardItems())[0]
    await card.props.onApprove()

    expect(bridge["sync-server:approve-agent"]).toHaveBeenCalledWith("req-q", "482913")
    expect(callOrder.indexOf("approve-agent")).toBeLessThan(callOrder.lastIndexOf("list-agents"))
    expect((await agentCardItems()).every((item) => item.closing)).toBe(true)
  })

  it("declines_TC-8b_an_agent_without_re-reading_the_list_and_closes_the_card", async () => {
    const requestQ = makeAgentRequest({requestId: "req-q", code: "482913"})
    const bridge = bridgeForAgents({
      "sync-server:get-state": vi.fn().mockResolvedValue({binding: makeBinding(), revoked: false, mismatch: null}),
      "sync-server:get-pending-agent-request": vi.fn().mockResolvedValue(requestQ),
      "sync-server:deny-agent": vi.fn().mockResolvedValue(undefined),
    })
    const store = await getStore()
    store.watchForApprovals()
    await flush()

    const listAgentsCallsBefore = bridge["sync-server:list-agents"].mock.calls.length
    const card = (await agentCardItems())[0]
    await card.props.onDeny()

    expect(bridge["sync-server:deny-agent"]).toHaveBeenCalledWith("req-q")
    expect(bridge["sync-server:list-agents"].mock.calls.length).toBe(listAgentsCallsBefore)
    expect((await agentCardItems()).every((item) => item.closing)).toBe(true)
  })

  it("logs_TC-8c_a_failed_approve_and_still_closes_the_card_with_nothing_shown", async () => {
    const requestQ = makeAgentRequest({requestId: "req-q", code: "482913"})
    bridgeForAgents({
      "sync-server:get-state": vi.fn().mockResolvedValue({binding: makeBinding(), revoked: false, mismatch: null}),
      "sync-server:get-pending-agent-request": vi.fn().mockResolvedValue(requestQ),
      "sync-server:approve-agent": vi.fn().mockRejectedValue(new Error("expired")),
    })
    const store = await getStore()
    store.watchForApprovals()
    await flush()

    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {})
    const card = (await agentCardItems())[0]
    await card.props.onApprove()

    expect(consoleErrorSpy).toHaveBeenCalledWith("Failed to approve the agent:", expect.any(Error))
    expect((await agentCardItems()).every((item) => item.closing)).toBe(true)
    consoleErrorSpy.mockRestore()
  })
})

function fourDevices() {
  return [
    makeDevice({id: "dev-p", name: "Gate Mac", role: "parent", isThisMac: true}),
    makeDevice({id: "dev-c", name: "Mac mini", role: "child", isThisMac: false, revokedAt: "2026-09-10T00:00:00.000Z"}),
    makeDevice({id: "dev-q", name: "Old Mac Pro", role: "parent", isThisMac: false, revokedAt: "2026-09-11T00:00:00.000Z"}),
    makeDevice({id: "dev-d", name: "MacBook Air", role: "child", isThisMac: false}),
  ]
}

describe("syncServerStore — no revoked device in membership, whatever its role (TC-46)", () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  async function getStore() {
    const {useSyncServerStore} = await import("../../../src/renderer/src/stores/syncServer.store")
    const store = useSyncServerStore()
    await flush()
    return store
  }

  it("holds_TC-46a_only_the_active_devices_after_loading_leaving_every_revoked_role_out", async () => {
    const enrollmentWindow = {expiresAt: "2026-09-21T00:05:00.000Z"}
    bridgeForAgents({
      "sync-server:list-membership": vi.fn().mockResolvedValue({devices: fourDevices(), enrollmentWindow}),
    })
    const store = await getStore()

    expect(store.membership?.devices.map((device) => device.id)).toEqual(["dev-p", "dev-d"])
    expect(store.membership?.enrollmentWindow).toEqual(enrollmentWindow)
  })

  it("keeps_TC-46b_only_this_macs_device_after_revoking_another_but_resolves_to_the_bridges_own_unfiltered_answer", async () => {
    const revokedAnswer = {
      devices: fourDevices().map((device) => (device.id === "dev-d" ? {...device, revokedAt: "2026-09-21T00:00:00.000Z"} : device)),
      enrollmentWindow: null,
    }
    const bridge = bridgeForAgents({
      "sync-server:list-membership": vi.fn().mockResolvedValue({devices: fourDevices(), enrollmentWindow: null}),
      "sync-server:revoke-device": vi.fn().mockResolvedValue(revokedAnswer),
    })
    const store = await getStore()
    expect(store.membership?.devices.map((device) => device.id)).toEqual(["dev-p", "dev-d"])

    const result = await store.revokeDevice("dev-d")

    expect(bridge["sync-server:revoke-device"]).toHaveBeenCalledWith("dev-d")
    expect(store.membership?.devices.map((device) => device.id)).toEqual(["dev-p"])
    expect(result).toEqual(revokedAnswer)
    expect(result.devices.map((device) => device.id)).toEqual(["dev-p", "dev-c", "dev-q", "dev-d"])
  })

  it("re-reads_TC-46c_the_same_filtered_pair_after_opening_the_enrollment_window", async () => {
    const enrollmentWindow = {expiresAt: "2026-09-21T00:05:00.000Z"}
    bridgeForAgents({
      "sync-server:list-membership": vi.fn().mockResolvedValue({devices: fourDevices(), enrollmentWindow}),
      "sync-server:open-enrollment-window": vi.fn().mockResolvedValue(enrollmentWindow),
    })
    const store = await getStore()

    await store.openEnrollmentWindow()

    expect(store.membership?.devices.map((device) => device.id)).toEqual(["dev-p", "dev-d"])
  })
})
