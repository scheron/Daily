// @vitest-environment happy-dom
// @ts-nocheck
import {createPinia, setActivePinia} from "pinia"
import {afterEach, beforeEach, describe, expect, it, vi} from "vitest"

import {mount} from "@vue/test-utils"
import {mockBridgeIPC} from "../../helpers/bridgeIPC"

const OLDER = {
  at: "2026-11-11T10:00:00.000Z",
  firstAt: "2026-11-11T10:00:00.000Z",
  level: "info",
  source: "mac",
  method: "GET",
  path: "/v1/agents",
  status: 200,
  durationMs: 12,
  device: null,
  error: null,
}
const NEWER = {
  at: "2026-11-11T10:05:00.000Z",
  firstAt: "2026-11-11T10:03:00.000Z",
  level: "error",
  source: "mac",
  method: "POST",
  path: "/v1/agents/revoke",
  status: null,
  durationMs: 8003,
  device: null,
  error: "UNREACHABLE: The request timed out",
}

describe("ServerLogs — the collapsible request log under the device tables", () => {
  let wrapper = null
  let getLogs = null

  beforeEach(() => {
    setActivePinia(createPinia())
  })

  afterEach(() => {
    wrapper?.unmount()
    wrapper = null
  })

  async function setup(entries, serverIssue = null) {
    getLogs = vi.fn().mockResolvedValue({entries, serverIssue})
    mockBridgeIPC({"sync-server:get-logs": getLogs})

    const {default: ServerLogs} =
      await import("../../../src/renderer/src/ui/views/Settings/{fragments}/SyncSettings/{fragments}/ServerDetails/{fragments}/ServerLogs")

    wrapper = mount(ServerLogs)
    await wrapper.vm.$nextTick()
  }

  async function settle() {
    await new Promise((resolve) => setTimeout(resolve, 0))
    await wrapper.vm.$nextTick()
  }

  function buttonLabelled(label) {
    return wrapper.findAll("button").find((button) => button.text().trim() === label)
  }

  it("reads nothing while collapsed and loads on Show logs, newest first, with the full failure reason", async () => {
    await setup([OLDER, NEWER])
    expect(getLogs).not.toHaveBeenCalled()

    await buttonLabelled("Show logs").trigger("click")
    await settle()

    expect(getLogs).toHaveBeenCalledTimes(1)
    const lines = wrapper.findAll("div.font-mono > div").map((line) => line.text())
    expect(lines).toHaveLength(2)
    expect(lines[0]).toContain("ERROR mac POST /v1/agents/revoke — 8003 ms UNREACHABLE: The request timed out")
    expect(lines[0]).toContain(" – ")
    expect(lines[1]).toContain("INFO mac GET /v1/agents 200 12 ms")
    expect(buttonLabelled("Hide logs")).toBeDefined()
  })

  it("reloads on Refresh and says so when nothing was logged", async () => {
    await setup([])
    await buttonLabelled("Show logs").trigger("click")
    await settle()

    expect(wrapper.text()).toContain("No requests logged yet.")

    await buttonLabelled("Refresh").trigger("click")
    await settle()
    expect(getLogs).toHaveBeenCalledTimes(2)
  })

  it("copies every line as the screen shows it", async () => {
    Object.defineProperty(navigator, "clipboard", {value: undefined, configurable: true})
    let captured = null
    document.execCommand = vi.fn((command) => {
      if (command === "copy") captured = document.body.querySelector("textarea")?.value ?? null
      return true
    })

    await setup([OLDER, NEWER])
    await buttonLabelled("Show logs").trigger("click")
    await settle()
    await buttonLabelled("Copy logs").trigger("click")
    await settle()

    const rows = wrapper.findAll("div.font-mono > div").map((line) => line.text().replace(/\s+/g, " "))
    expect(captured.split("\n").map((line) => line.replace(/\s+/g, " "))).toEqual(rows)
    expect(captured).toContain("UNREACHABLE: The request timed out")
  })

  it("says why the server has no entries and still lists the Mac's own", async () => {
    await setup([NEWER], {kind: "outdated"})
    await buttonLabelled("Show logs").trigger("click")
    await settle()

    expect(wrapper.text()).toContain("This server is too old to show logs. Update it to the latest version.")
    expect(wrapper.findAll("div.font-mono > div")).toHaveLength(1)

    wrapper.unmount()
    await setup([NEWER], {kind: "failed", message: "The request timed out"})
    await buttonLabelled("Show logs").trigger("click")
    await settle()

    expect(wrapper.text()).toContain("Server entries are unavailable: The request timed out")
    expect(wrapper.findAll("div.font-mono > div")).toHaveLength(1)
  })
})
