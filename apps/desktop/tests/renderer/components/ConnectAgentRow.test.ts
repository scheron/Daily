// @vitest-environment happy-dom
// @ts-nocheck
import {toasts} from "vue-toasts-lite"
import {createPinia, setActivePinia} from "pinia"
import {afterEach, beforeEach, describe, expect, it, vi} from "vitest"

import {mount} from "@vue/test-utils"
import {mockBridgeIPC} from "../../helpers/bridgeIPC"

vi.mock("vue-toasts-lite", () => ({toasts: {success: vi.fn(), error: vi.fn()}}))

function makeBinding(overrides = {}) {
  return {
    baseUrl: "http://127.0.0.1:8787",
    serverId: "srv-1",
    serverName: "Home Server",
    deviceId: "dev-1",
    deviceName: "Gate Mac",
    fingerprint: null,
    insecure: false,
    boundAt: "2026-08-10T00:00:00.000Z",
    role: "parent",
    approvedBy: null,
    acceptsAgents: true,
    ...overrides,
  }
}

function makeAgentWindow(overrides = {}) {
  return {
    expiresAt: new Date(Date.now() + 300_000).toISOString(),
    agentAddress: "http://127.0.0.1:8787/mcp",
    isThisMac: true,
    ...overrides,
  }
}

describe("ConnectAgentRow — the waiting panel, copying and re-reading (TC-16 to TC-21)", () => {
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

  async function setup(bridgeOverrides = {}) {
    mockBridgeIPC({
      "sync-server:get-state": vi.fn().mockResolvedValue({binding: makeBinding(), revoked: false, mismatch: null}),
      "sync-server:on-revoked": vi.fn(),
      "sync-server:on-approval-requested": vi.fn(),
      "sync-server:get-pending-approval": vi.fn().mockResolvedValue(null),
      "sync-server:on-protocol-mismatch-changed": vi.fn(),
      "sync-server:on-role-changed": vi.fn(),
      "sync-server:on-agents-accepted-changed": vi.fn(),
      "sync-server:on-agent-requested": vi.fn(),
      "sync-server:list-membership": vi.fn().mockResolvedValue({devices: [], enrollmentWindow: null}),
      "sync-server:list-agents": vi.fn().mockResolvedValue({agents: [], agentWindow: null}),
      "sync-server:open-agent-window": vi.fn().mockResolvedValue(makeAgentWindow()),
      "sync-server:close-agent-window": vi.fn().mockResolvedValue(undefined),
      "sync-server:get-pending-agent-request": vi.fn().mockResolvedValue(null),
      ...bridgeOverrides,
    })

    const {default: ConnectAgentRow} =
      await import("../../../src/renderer/src/ui/views/Settings/{fragments}/SyncSettings/{fragments}/ServerDetails/{fragments}/ConnectAgentRow.vue")

    wrapper = mount(ConnectAgentRow)
    await vi.advanceTimersByTimeAsync(0)
    await wrapper.vm.$nextTick()
  }

  function findButtonByText(text) {
    return wrapper.findAll("button").find((button) => button.text().trim() === text)
  }

  it("shows_TC-16_the_waiting_panels_strings_and_address_once_this_macs_window_is_already_open", async () => {
    const listAgentsMock = vi.fn().mockResolvedValue({
      agents: [],
      agentWindow: makeAgentWindow({
        expiresAt: new Date(Date.now() + 300_000).toISOString(),
        agentAddress: "http://127.0.0.1:8787/mcp",
        isThisMac: true,
      }),
    })

    await setup({"sync-server:list-agents": listAgentsMock})

    const text = wrapper.text()
    expect(text).toContain("Waiting for an agent to ask")
    expect(text).toContain("In the agent, add this server, then sign in — the request shows up here.")
    expect(text).toContain("http://127.0.0.1:8787/mcp")
    expect(text).toContain("Copy")
    expect(text).toContain("Claude Code: claude mcp add --transport http daily <address>, then /mcp → Authenticate")
    expect(text).toContain("Claude app: Settings → Connectors → Add custom connector")
    expect(text).toContain("5:00 left")
    expect(text).toContain("Cancel")
  })

  it("renders_TC-17_no_panel_at_all_while_another_macs_window_is_open_and_makes_no_re-read", async () => {
    const listAgentsMock = vi.fn().mockResolvedValue({agents: [], agentWindow: makeAgentWindow({isThisMac: false})})

    await setup({"sync-server:list-agents": listAgentsMock})

    const callsAfterMount = listAgentsMock.mock.calls.length
    expect(wrapper.text()).toBe("")

    await vi.advanceTimersByTimeAsync(10_000)
    expect(listAgentsMock.mock.calls.length).toBe(callsAfterMount)
  })

  it("copies_TC-18_the_address_toasts_and_shows_a_check_for_1500ms", async () => {
    Object.defineProperty(navigator, "clipboard", {value: undefined, configurable: true})

    let captured = null
    document.execCommand = vi.fn((command) => {
      if (command === "copy") captured = document.body.querySelector("textarea")?.value ?? null
      return true
    })

    const listAgentsMock = vi.fn().mockResolvedValue({
      agents: [],
      agentWindow: makeAgentWindow({
        expiresAt: new Date(Date.now() + 300_000).toISOString(),
        agentAddress: "http://127.0.0.1:8787/mcp",
        isThisMac: true,
      }),
    })

    await setup({"sync-server:list-agents": listAgentsMock})

    const findCopyButton = () => wrapper.findAll("button").find((button) => button.text().includes("Copy"))

    await findCopyButton().trigger("click")
    await vi.advanceTimersByTimeAsync(0)
    await wrapper.vm.$nextTick()

    expect(captured).toBe("http://127.0.0.1:8787/mcp")
    expect(toasts.success).toHaveBeenCalledWith("Address copied")
    expect(findCopyButton().find("use").attributes("href")).toBe("#check")

    await vi.advanceTimersByTimeAsync(1_500)
    await wrapper.vm.$nextTick()

    expect(findCopyButton().find("use").attributes("href")).toBe("#copy")
  })

  it("closes_TC-19_the_agent_window_on_cancel_so_the_agent_panel_is_gone", async () => {
    const callOrder = []
    let listAgentsCalls = 0
    const listAgentsMock = vi.fn().mockImplementation(() => {
      listAgentsCalls += 1
      callOrder.push("list-agents")
      if (listAgentsCalls === 1) return Promise.resolve({agents: [], agentWindow: makeAgentWindow()})
      return Promise.resolve({agents: [], agentWindow: null})
    })
    const closeAgentWindowMock = vi.fn().mockImplementation(() => {
      callOrder.push("close-agent-window")
      return Promise.resolve()
    })

    await setup({"sync-server:list-agents": listAgentsMock, "sync-server:close-agent-window": closeAgentWindowMock})
    expect(wrapper.text()).toContain("Waiting for an agent to ask")

    await findButtonByText("Cancel").trigger("click")
    await vi.advanceTimersByTimeAsync(0)
    await wrapper.vm.$nextTick()

    expect(closeAgentWindowMock).toHaveBeenCalledTimes(1)
    expect(callOrder).toEqual(["list-agents", "close-agent-window", "list-agents"])
    expect(wrapper.text()).toBe("")
  })

  it("re-reads_TC-20_the_agent_list_every_3_seconds_while_this_macs_window_is_open", async () => {
    const listAgentsMock = vi.fn().mockResolvedValue({agents: [], agentWindow: makeAgentWindow()})

    await setup({"sync-server:list-agents": listAgentsMock})
    const callsAtMount = listAgentsMock.mock.calls.length

    await vi.advanceTimersByTimeAsync(9_000)

    expect(listAgentsMock.mock.calls.length).toBe(callsAtMount + 3)
  })

  it("stops_TC-21a_re-reading_once_a_re-read_reports_no_window", async () => {
    let calls = 0
    const listAgentsMock = vi.fn().mockImplementation(() => {
      calls += 1
      if (calls === 1) return Promise.resolve({agents: [], agentWindow: makeAgentWindow()})
      return Promise.resolve({agents: [], agentWindow: null})
    })

    await setup({"sync-server:list-agents": listAgentsMock})
    expect(wrapper.text()).toContain("Waiting for an agent to ask")

    await vi.advanceTimersByTimeAsync(3_000)
    await wrapper.vm.$nextTick()
    expect(wrapper.text()).toBe("")

    const callsAfterStop = listAgentsMock.mock.calls.length
    await vi.advanceTimersByTimeAsync(30_000)
    expect(listAgentsMock.mock.calls.length).toBe(callsAfterStop)
  })

  it("stops_TC-21b_re-reading_once_the_window_moved_to_another_mac", async () => {
    let calls = 0
    const listAgentsMock = vi.fn().mockImplementation(() => {
      calls += 1
      if (calls === 1) return Promise.resolve({agents: [], agentWindow: makeAgentWindow()})
      return Promise.resolve({agents: [], agentWindow: makeAgentWindow({isThisMac: false})})
    })

    await setup({"sync-server:list-agents": listAgentsMock})
    expect(wrapper.text()).toContain("Waiting for an agent to ask")

    await vi.advanceTimersByTimeAsync(3_000)
    await wrapper.vm.$nextTick()
    expect(wrapper.text()).toBe("")

    const callsAfterStop = listAgentsMock.mock.calls.length
    await vi.advanceTimersByTimeAsync(30_000)
    expect(listAgentsMock.mock.calls.length).toBe(callsAfterStop)
  })

  it("stops_TC-21c_after_the_countdowns_own_re-read_at_expiry_reports_no_window", async () => {
    const startWindow = makeAgentWindow({expiresAt: new Date(Date.now() + 4_500).toISOString()})
    let calls = 0
    const listAgentsMock = vi.fn().mockImplementation(() => {
      calls += 1
      if (calls <= 2) return Promise.resolve({agents: [], agentWindow: startWindow})
      return Promise.resolve({agents: [], agentWindow: null})
    })

    await setup({"sync-server:list-agents": listAgentsMock})
    const callsAtMount = listAgentsMock.mock.calls.length

    await vi.advanceTimersByTimeAsync(5_000)
    await wrapper.vm.$nextTick()

    expect(listAgentsMock.mock.calls.length).toBe(callsAtMount + 2)
    expect(wrapper.text()).toBe("")

    const callsAfterExpiry = listAgentsMock.mock.calls.length
    await vi.advanceTimersByTimeAsync(30_000)
    expect(listAgentsMock.mock.calls.length).toBe(callsAfterExpiry)
  })

  it("stops_TC-21d_re-reading_once_the_row_unmounts", async () => {
    const listAgentsMock = vi.fn().mockResolvedValue({agents: [], agentWindow: makeAgentWindow()})

    await setup({"sync-server:list-agents": listAgentsMock})
    const callsAtMount = listAgentsMock.mock.calls.length

    wrapper.unmount()
    wrapper = null

    await vi.advanceTimersByTimeAsync(30_000)
    expect(listAgentsMock.mock.calls.length).toBe(callsAtMount)
  })
})
