// @vitest-environment happy-dom
// @ts-nocheck
import {createPinia, setActivePinia} from "pinia"
import {afterEach, beforeEach, describe, expect, it, vi} from "vitest"

import {mount} from "@vue/test-utils"
import {mockBridgeIPC} from "../../helpers/bridgeIPC"
import {makeAgentWindow, makeBinding} from "../../helpers/syncServerFixtures"

describe("ServerActions — the pair of equal actions beside Disconnect and their disabled state (TC-48, TC-22)", () => {
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

  function actionLabels() {
    return wrapper.findAll("button").map((button) => button.text().trim())
  }

  it("holds_TC-48a_two_equal_buttons_each_with_its_own_mark_and_no_panel_for_an_accepting_parent_with_no_window_open", async () => {
    await setup({isAddDeviceShown: true, isConnectAgentShown: true})

    expect(actionLabels()).toEqual(["Device", "Agent"])

    const addButton = actionButton("Device")
    const connectButton = actionButton("Agent")
    expect(addButton.find("use").attributes("href")).toBe("#monitor")
    expect(connectButton.find("use").attributes("href")).toBe("#ai")
    expect(addButton.attributes("disabled")).toBeUndefined()
    expect(connectButton.attributes("disabled")).toBeUndefined()
    expect(connectButton.classes().sort()).toEqual(addButton.classes().sort())
    expect(connectButton.element.parentElement).toBe(addButton.element.parentElement)

    expect(wrapper.text()).not.toContain("Waiting for the other Mac to ask")
    expect(wrapper.text()).not.toContain("Waiting for an agent to ask")
  })

  it("holds_TC-48b_only_the_connect_button_with_the_first_buttons_classes_for_an_accepting_child", async () => {
    await setup({isAddDeviceShown: true, isConnectAgentShown: true})
    const soleButtonClasses = actionButton("Device").classes().sort()

    await setup({isAddDeviceShown: false, isConnectAgentShown: true})

    expect(actionLabels()).toEqual(["Agent"])
    expect(actionButton("Agent").classes().sort()).toEqual(soleButtonClasses)
  })

  it("holds_TC-48c_only_add_a_device_for_a_refusing_parent_and_never_the_domain_line_itself", async () => {
    await setup({isAddDeviceShown: true, isConnectAgentShown: false})

    expect(actionLabels()).toEqual(["Device"])
    expect(wrapper.text()).not.toContain("Agents need this server on a domain with a trusted certificate.")
  })

  it("holds_TC-48d_only_add_a_device_when_accepts_agents_is_null", async () => {
    await setup({isAddDeviceShown: true, isConnectAgentShown: false})

    expect(actionLabels()).toEqual(["Device"])
    expect(wrapper.text()).not.toContain("Agents need this server on a domain with a trusted certificate.")
  })

  it("disables_TC-48e_both_buttons_while_both_windows_are_open_and_renders_no_panel_of_its_own", async () => {
    await setup(
      {isAddDeviceShown: true, isConnectAgentShown: true},
      {
        "sync-server:list-membership": vi
          .fn()
          .mockResolvedValue({devices: [], enrollmentWindow: {expiresAt: new Date(Date.now() + 300_000).toISOString()}}),
        "sync-server:list-agents": vi.fn().mockResolvedValue({agents: [], agentWindow: makeAgentWindow({isThisMac: true})}),
      },
    )

    expect(actionButton("Device").attributes("disabled")).toBeDefined()
    expect(actionButton("Agent").attributes("disabled")).toBeDefined()

    expect(wrapper.text()).not.toContain("Waiting for the other Mac to ask")
    expect(wrapper.text()).not.toContain("Waiting for an agent to ask")
  })

  it("keeps_TC-48f_connect_an_agent_enabled_with_no_panel_when_the_window_is_on_another_mac_and_opens_it_here_on_press", async () => {
    const openAgentWindowMock = vi.fn().mockResolvedValue(makeAgentWindow())
    await setup(
      {isAddDeviceShown: true, isConnectAgentShown: true},
      {
        "sync-server:list-agents": vi.fn().mockResolvedValue({agents: [], agentWindow: makeAgentWindow({isThisMac: false})}),
        "sync-server:open-agent-window": openAgentWindowMock,
      },
    )

    const connectButton = actionButton("Agent")
    expect(connectButton.attributes("disabled")).toBeUndefined()
    expect(wrapper.text()).not.toContain("Waiting for an agent to ask")

    await connectButton.trigger("click")
    await vi.advanceTimersByTimeAsync(0)

    expect(openAgentWindowMock).toHaveBeenCalledTimes(1)
  })

  it("opens_TC-16_an_agent_window_on_the_press_and_re-reads_the_agent_list_after_it", async () => {
    const callOrder = []
    const listAgentsMock = vi.fn().mockImplementation(() => {
      callOrder.push("list-agents")
      return Promise.resolve({agents: [], agentWindow: null})
    })
    const openAgentWindowMock = vi.fn().mockImplementation(() => {
      callOrder.push("open-agent-window")
      return Promise.resolve(makeAgentWindow())
    })

    await setup(
      {isAddDeviceShown: true, isConnectAgentShown: true},
      {"sync-server:list-agents": listAgentsMock, "sync-server:open-agent-window": openAgentWindowMock},
    )

    await actionButton("Agent").trigger("click")
    await vi.advanceTimersByTimeAsync(0)
    await wrapper.vm.$nextTick()

    expect(openAgentWindowMock).toHaveBeenCalledTimes(1)
    expect(callOrder).toEqual(["list-agents", "open-agent-window", "list-agents"])
  })

  it("logs_TC-22_a_failed_open_and_leaves_connect_an_agent_enabled_with_no_panel", async () => {
    const openAgentWindowMock = vi.fn().mockRejectedValue(new Error("boom"))
    await setup({isAddDeviceShown: true, isConnectAgentShown: true}, {"sync-server:open-agent-window": openAgentWindowMock})

    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {})

    await actionButton("Agent").trigger("click")
    await vi.advanceTimersByTimeAsync(0)
    await wrapper.vm.$nextTick()

    expect(consoleErrorSpy).toHaveBeenCalledWith("Failed to open the Agent window:", expect.any(Error))
    expect(wrapper.text()).not.toContain("Waiting for an agent to ask")
    expect(actionButton("Agent").attributes("disabled")).toBeUndefined()

    consoleErrorSpy.mockRestore()
  })
})
