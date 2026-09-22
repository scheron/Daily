// @vitest-environment happy-dom
// @ts-nocheck
import {createPinia, setActivePinia} from "pinia"
import {afterEach, beforeEach, describe, expect, it, vi} from "vitest"

import {mount} from "@vue/test-utils"
import {mockBridgeIPC} from "../../helpers/bridgeIPC"
import {makeAgentWindow, makeBinding} from "../../helpers/syncServerFixtures"

describe("ServerActions — the row of equal actions, its panels and their disabled state (TC-48, TC-16, TC-22)", () => {
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

  async function setup(props, bridgeOverrides = {}) {
    wrapper?.unmount()

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
      "sync-server:list-agents": vi.fn().mockResolvedValue({agents: [], agentWindow: null}),
      "sync-server:open-enrollment-window": vi.fn().mockResolvedValue({expiresAt: new Date(Date.now() + 300_000).toISOString()}),
      "sync-server:close-enrollment-window": vi.fn().mockResolvedValue(undefined),
      "sync-server:open-agent-window": vi.fn().mockResolvedValue(makeAgentWindow()),
      "sync-server:close-agent-window": vi.fn().mockResolvedValue(undefined),
      ...bridgeOverrides,
    })

    const {default: ServerActions} =
      await import("../../../src/renderer/src/ui/views/Settings/{fragments}/SyncSettings/{fragments}/ServerDetails/{fragments}/ServerActions.vue")

    wrapper = mount(ServerActions, {props})
    await vi.advanceTimersByTimeAsync(0)
    await wrapper.vm.$nextTick()
  }

  function actionButton(label) {
    return wrapper.findAll("button").find((button) => button.text().trim() === label)
  }

  it("holds_TC-48a_two_equal_buttons_with_identical_classes_and_no_panel_for_an_accepting_parent_with_no_window_open", async () => {
    await setup({isAddDeviceShown: true, isConnectAgentShown: true, isDomainLineShown: false})

    const buttons = wrapper.findAll("button").map((button) => button.text().trim())
    expect(buttons).toEqual(["Add a device", "Connect an agent"])

    const addButton = actionButton("Add a device")
    const connectButton = actionButton("Connect an agent")
    expect(addButton.find("use").attributes("href")).toBe("#plus")
    expect(connectButton.find("use").attributes("href")).toBe("#plus")
    expect(addButton.attributes("disabled")).toBeUndefined()
    expect(connectButton.attributes("disabled")).toBeUndefined()
    expect(connectButton.classes().sort()).toEqual(addButton.classes().sort())
    expect(connectButton.element.parentElement).toBe(addButton.element.parentElement)

    expect(wrapper.text()).not.toContain("Waiting for the other Mac to ask")
    expect(wrapper.text()).not.toContain("Waiting for an agent to ask")
  })

  it("holds_TC-48b_only_the_connect_button_with_the_first_buttons_classes_for_an_accepting_child", async () => {
    await setup({isAddDeviceShown: true, isConnectAgentShown: true, isDomainLineShown: false})
    const soleButtonClasses = actionButton("Add a device").classes().sort()

    await setup({isAddDeviceShown: false, isConnectAgentShown: true, isDomainLineShown: false})

    const buttons = wrapper.findAll("button").map((button) => button.text().trim())
    expect(buttons).toEqual(["Connect an agent"])
    expect(actionButton("Connect an agent").classes().sort()).toEqual(soleButtonClasses)
  })

  it("holds_TC-48c_add_a_device_then_the_domain_line_for_a_refusing_parent_with_no_connect_button", async () => {
    await setup({isAddDeviceShown: true, isConnectAgentShown: false, isDomainLineShown: true})

    const buttons = wrapper.findAll("button").map((button) => button.text().trim())
    expect(buttons).toEqual(["Add a device"])
    expect(wrapper.text()).toContain("Agents need this server on a domain with a trusted certificate.")
    expect(wrapper.text()).not.toContain("Connect an agent")

    const text = wrapper.text()
    expect(text.indexOf("Add a device")).toBeLessThan(text.indexOf("Agents need this server on a domain with a trusted certificate."))
    const domainLine = wrapper.findAll("p").find((line) => line.text().includes("Agents need this server"))
    expect(domainLine?.element.parentElement).toBe(actionButton("Add a device").element.parentElement)
  })

  it("holds_TC-48d_only_add_a_device_when_accepts_agents_is_null", async () => {
    await setup({isAddDeviceShown: true, isConnectAgentShown: false, isDomainLineShown: false})

    const buttons = wrapper.findAll("button").map((button) => button.text().trim())
    expect(buttons).toEqual(["Add a device"])
    expect(wrapper.text()).not.toContain("Agents need this server on a domain with a trusted certificate.")
    expect(wrapper.text()).not.toContain("Connect an agent")
  })

  it("disables_TC-48e_both_buttons_and_shows_the_device_panel_then_the_agent_panel_when_both_windows_are_open", async () => {
    await setup(
      {isAddDeviceShown: true, isConnectAgentShown: true, isDomainLineShown: false},
      {
        "sync-server:list-membership": vi
          .fn()
          .mockResolvedValue({devices: [], enrollmentWindow: {expiresAt: new Date(Date.now() + 300_000).toISOString()}}),
        "sync-server:list-agents": vi.fn().mockResolvedValue({agents: [], agentWindow: makeAgentWindow({isThisMac: true})}),
      },
    )

    const addButton = actionButton("Add a device")
    const connectButton = actionButton("Connect an agent")
    expect(addButton.attributes("disabled")).toBeDefined()
    expect(connectButton.attributes("disabled")).toBeDefined()

    const text = wrapper.text()
    const deviceIndex = text.indexOf("Waiting for the other Mac to ask")
    const agentIndex = text.indexOf("Waiting for an agent to ask")
    expect(deviceIndex).toBeGreaterThan(-1)
    expect(agentIndex).toBeGreaterThan(deviceIndex)
  })

  it("keeps_TC-48f_connect_an_agent_enabled_with_no_panel_when_the_window_is_on_another_mac_and_opens_it_here_on_press", async () => {
    const openAgentWindowMock = vi.fn().mockResolvedValue(makeAgentWindow())
    await setup(
      {isAddDeviceShown: true, isConnectAgentShown: true, isDomainLineShown: false},
      {
        "sync-server:list-agents": vi.fn().mockResolvedValue({agents: [], agentWindow: makeAgentWindow({isThisMac: false})}),
        "sync-server:open-agent-window": openAgentWindowMock,
      },
    )

    const connectButton = actionButton("Connect an agent")
    expect(connectButton.attributes("disabled")).toBeUndefined()
    expect(wrapper.text()).not.toContain("Waiting for an agent to ask")

    await connectButton.trigger("click")
    await vi.advanceTimersByTimeAsync(0)

    expect(openAgentWindowMock).toHaveBeenCalledTimes(1)
  })

  it("opens_TC-16_an_agent_window_from_the_row_and_shows_the_waiting_panel_after_the_press", async () => {
    let listAgentsCalls = 0
    const callOrder = []
    const listAgentsMock = vi.fn().mockImplementation(() => {
      listAgentsCalls += 1
      callOrder.push("list-agents")
      if (listAgentsCalls === 1) return Promise.resolve({agents: [], agentWindow: null})
      return Promise.resolve({
        agents: [],
        agentWindow: makeAgentWindow({
          expiresAt: new Date(Date.now() + 300_000).toISOString(),
          agentAddress: "http://127.0.0.1:8787/mcp",
          isThisMac: true,
        }),
      })
    })
    const openAgentWindowMock = vi.fn().mockImplementation(() => {
      callOrder.push("open-agent-window")
      return Promise.resolve(makeAgentWindow())
    })

    await setup(
      {isAddDeviceShown: true, isConnectAgentShown: true, isDomainLineShown: false},
      {"sync-server:list-agents": listAgentsMock, "sync-server:open-agent-window": openAgentWindowMock},
    )

    expect(wrapper.text()).not.toContain("Waiting for an agent to ask")
    expect(wrapper.text()).not.toContain("http://127.0.0.1:8787/mcp")

    await actionButton("Connect an agent").trigger("click")
    await vi.advanceTimersByTimeAsync(0)
    await wrapper.vm.$nextTick()

    expect(openAgentWindowMock).toHaveBeenCalledTimes(1)
    expect(callOrder).toEqual(["list-agents", "open-agent-window", "list-agents"])

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

  it("logs_TC-22_a_failed_open_and_leaves_connect_an_agent_enabled_with_no_panel", async () => {
    const openAgentWindowMock = vi.fn().mockRejectedValue(new Error("boom"))
    await setup({isAddDeviceShown: true, isConnectAgentShown: true, isDomainLineShown: false}, {"sync-server:open-agent-window": openAgentWindowMock})

    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {})

    await actionButton("Connect an agent").trigger("click")
    await vi.advanceTimersByTimeAsync(0)
    await wrapper.vm.$nextTick()

    expect(consoleErrorSpy).toHaveBeenCalledWith("Failed to open the Agent window:", expect.any(Error))
    expect(wrapper.text()).not.toContain("Waiting for an agent to ask")
    expect(actionButton("Connect an agent").attributes("disabled")).toBeUndefined()

    consoleErrorSpy.mockRestore()
  })
})
