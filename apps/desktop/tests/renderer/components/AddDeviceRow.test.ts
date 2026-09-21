// @vitest-environment happy-dom
// @ts-nocheck
import {createPinia, setActivePinia} from "pinia"
import {afterEach, beforeEach, describe, expect, it, vi} from "vitest"

import {mount} from "@vue/test-utils"
import {mockBridgeIPC} from "../../helpers/bridgeIPC"

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

describe("AddDeviceRow — the shared countdown, unmoved (TC-12 to TC-15)", () => {
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

  async function setup(listMembershipMock) {
    mockBridgeIPC({
      "sync-server:get-state": vi.fn().mockResolvedValue({binding: makeBinding(), revoked: false, mismatch: null}),
      "sync-server:on-revoked": vi.fn(),
      "sync-server:on-approval-requested": vi.fn(),
      "sync-server:get-pending-approval": vi.fn().mockResolvedValue(null),
      "sync-server:on-protocol-mismatch-changed": vi.fn(),
      "sync-server:on-role-changed": vi.fn(),
      "sync-server:on-agents-accepted-changed": vi.fn(),
      "sync-server:list-agents": vi.fn().mockResolvedValue({agents: [], agentWindow: null}),
      "sync-server:list-membership": listMembershipMock,
    })

    const {default: AddDeviceRow} =
      await import("../../../src/renderer/src/ui/views/Settings/{fragments}/SyncSettings/{fragments}/ServerDetails/{fragments}/AddDeviceRow.vue")

    wrapper = mount(AddDeviceRow)
    await vi.advanceTimersByTimeAsync(0)
    await wrapper.vm.$nextTick()
  }

  it("rounds_TC-12_the_countdown_up_to_the_next_second_reading_5_00_then_4_59_a_second_later", async () => {
    const now = Date.now()
    const expiresAt = new Date(now + 299_500).toISOString()
    await setup(vi.fn().mockResolvedValue({devices: [], enrollmentWindow: {expiresAt}}))

    expect(wrapper.text()).toContain("5:00 left")

    await vi.advanceTimersByTimeAsync(1_000)
    await wrapper.vm.$nextTick()

    expect(wrapper.text()).toContain("4:59 left")
  })

  it("turns_TC-13_the_countdown_into_the_warning_colour_at_60_seconds_left_inclusive", async () => {
    const now = Date.now()
    const expiresAt = new Date(now + 61_000).toISOString()
    await setup(vi.fn().mockResolvedValue({devices: [], enrollmentWindow: {expiresAt}}))

    const countdownSpan = () => wrapper.findAll("span").find((el) => el.text().includes("left"))

    expect(countdownSpan().classes()).not.toContain("text-warning")

    await vi.advanceTimersByTimeAsync(1_000)
    await wrapper.vm.$nextTick()

    expect(countdownSpan().classes()).toContain("text-warning")
  })

  it("re-reads_TC-14_the_membership_once_at_zero_once_more_a_second_later_while_the_window_still_reports_and_then_stops", async () => {
    const now = Date.now()
    const staleWindow = {expiresAt: new Date(now + 2_000).toISOString()}
    let calls = 0
    const listMembershipMock = vi.fn().mockImplementation(() => {
      calls += 1
      if (calls <= 2) return Promise.resolve({devices: [], enrollmentWindow: staleWindow})
      return Promise.resolve({devices: [], enrollmentWindow: null})
    })

    await setup(listMembershipMock)
    expect(listMembershipMock).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(2_000)
    expect(listMembershipMock).toHaveBeenCalledTimes(2)

    await vi.advanceTimersByTimeAsync(1_000)
    expect(listMembershipMock).toHaveBeenCalledTimes(3)
    await wrapper.vm.$nextTick()
    expect(wrapper.text()).toBe("")

    await vi.advanceTimersByTimeAsync(10_000)
    expect(listMembershipMock).toHaveBeenCalledTimes(3)
  })

  it("stops_TC-15_ticking_after_the_row_unmounts_so_no_further_call_happens", async () => {
    const now = Date.now()
    const expiresAt = new Date(now + 2_000).toISOString()
    const listMembershipMock = vi.fn().mockResolvedValue({devices: [], enrollmentWindow: {expiresAt}})

    await setup(listMembershipMock)
    expect(listMembershipMock).toHaveBeenCalledTimes(1)

    wrapper.unmount()
    wrapper = null

    await vi.advanceTimersByTimeAsync(10_000)
    expect(listMembershipMock).toHaveBeenCalledTimes(1)
  })
})
