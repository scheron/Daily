import {createPinia, setActivePinia} from "pinia"
import {afterEach, beforeEach, describe, expect, it} from "vitest"

import {mount} from "@vue/test-utils"
import {mockBridgeIPC} from "../../../helpers/bridgeIPC"

import type {TaskEvent} from "@daily/protocol"
import type {VueWrapper} from "@vue/test-utils"

function makeEvent(overrides: Partial<TaskEvent> = {}): TaskEvent {
  return {
    id: "event-1",
    taskId: "task-1",
    branchId: "main",
    type: "created",
    eventDate: "2026-10-31",
    fromDate: null,
    toDate: null,
    createdAt: "2026-10-31T09:00:00.000Z",
    kind: "manual",
    provider: null,
    ...overrides,
  }
}

describe("an Activity event", () => {
  let wrapper: VueWrapper | undefined

  beforeEach(() => {
    setActivePinia(createPinia())
    mockBridgeIPC()
  })

  afterEach(() => wrapper?.unmount())

  async function renderEvent(event: TaskEvent) {
    const {default: HistoryEvent} =
      await import("../../../../src/renderer/src/ui/modules/RightPanel/{fragments}/History/{fragments}/HistoryEvent.vue")
    wrapper = mount(HistoryEvent, {props: {event}})
    return wrapper
  }

  it("keeps an event's exact timestamp available to assistive reading while the row receives focus", async () => {
    const row = await renderEvent(makeEvent())
    expect(row.findAll("time").map((time) => time.attributes("datetime"))).toEqual(["2026-10-31T09:00:00.000Z"])
    expect(row.attributes("tabindex")).toBe("0")
    expect(row.attributes("data-time")).toMatch(/\d{2}:\d{2}/)
  })

  it("replaces an MCP event's action badge with its client mark and exposes its source without losing the time", async () => {
    const row = await renderEvent(makeEvent({kind: "mcp", provider: "Codex", type: "edited"}))
    expect(row.find("use").attributes("href")).toBe("#codex")
    const source = row.get('[role="img"][aria-label="Codex"]')

    expect(source.attributes("data-source")).toBe("Codex")
    expect(source.attributes("tabindex")).toBe("0")
    expect(row.find('use[href="#pencil"]').exists()).toBe(false)
    expect(row.text()).toContain("Edited")
    expect(row.get("time").attributes("datetime")).toBe("2026-10-31T09:00:00.000Z")
    expect(row.attributes("data-time")).toMatch(/\d{2}:\d{2}/)
    expect(row.text()).not.toContain("Comment")
  })

  it("distinguishes the Daily Assistant from an external client with the same saved name", async () => {
    const row = await renderEvent(makeEvent({kind: "agent", provider: "Codex"}))
    expect(row.find("use").attributes("href")).toBe("#logo")
    const source = row.get('[role="img"][aria-label="Daily Assistant"]')

    expect(source.attributes("data-source")).toBe("Daily Assistant")
    expect(row.find('use[href="#plus"]').exists()).toBe(false)
    expect(row.text()).toContain("Created")
  })

  it("keeps an unknown client's saved name and gives an unnamed MCP source a readable fallback", async () => {
    const row = await renderEvent(makeEvent({kind: "mcp", provider: "  Cursor  "}))
    expect(row.find("use").attributes("href")).toBe("#ai")
    expect(row.get('[role="img"]').attributes("aria-label")).toBe("Cursor")
    expect(row.get('[role="img"]').attributes("data-source")).toBe("Cursor")

    for (const provider of ["   ", null]) {
      await row.setProps({event: makeEvent({kind: "mcp", provider})})
      expect(row.get('[role="img"]').attributes("aria-label")).toBe("MCP")
      expect(row.get('[role="img"]').attributes("data-source")).toBe("MCP")
      expect(row.find("use").attributes("href")).toBe("#ai")
    }
  })

  it("updates a reused row's source and restores the action badge when its next event is manual", async () => {
    const row = await renderEvent(makeEvent({kind: "mcp", provider: "Codex", type: "edited"}))

    await row.setProps({event: makeEvent({kind: "agent", provider: "daily_agent", type: "deleted"})})
    expect(row.get('[role="img"]').attributes("aria-label")).toBe("Daily Assistant")
    expect(row.get('[role="img"]').attributes("data-source")).toBe("Daily Assistant")
    expect(row.find("use").attributes("href")).toBe("#logo")
    expect(row.text()).toContain("Deleted")

    await row.setProps({event: makeEvent({type: "restored"})})
    expect(row.find("[data-source]").exists()).toBe(false)
    expect(row.find('[role="img"]').exists()).toBe(false)
    expect(row.find("use").attributes("href")).toBe("#undo")
    expect(row.text()).toContain("Restored")

    await row.setProps({event: makeEvent({kind: "mcp", provider: "Codex", type: "edited"})})
    expect(row.get('[role="img"]').attributes("aria-label")).toBe("Codex")
    expect(row.get('[role="img"]').attributes("data-source")).toBe("Codex")
    expect(row.find("use").attributes("href")).toBe("#codex")
    expect(row.text()).toContain("Edited")
  })

  it("retains action badges for manual and legacy events without inferring authorship from a leftover provider", async () => {
    const row = await renderEvent(makeEvent({provider: "Codex", type: "edited"}))
    expect(row.find("use").attributes("href")).toBe("#pencil")
    expect(row.find("[data-source]").exists()).toBe(false)
    expect(row.text()).toContain("Edited")

    const legacy = makeEvent({type: "completed"})
    Reflect.deleteProperty(legacy, "kind")
    Reflect.deleteProperty(legacy, "provider")
    await row.setProps({event: legacy})
    expect(row.find("use").attributes("href")).toBe("#check-check")
    expect(row.find("[data-source]").exists()).toBe(false)
    expect(row.text()).toContain("Completed")
  })

  it("shows each exact status and its icon independently of the board mode", async () => {
    const row = await renderEvent(makeEvent({type: "status_changed", fromStatus: "ready_for_agent", toStatus: "in_progress"}))
    const {useSettingsStore} = await import("../../../../src/renderer/src/stores/settings.store")
    const settings = useSettingsStore()

    for (const boardMode of ["normal", "agents"] as const) {
      settings.settings = {...settings.settings!, appearance: {...settings.settings!.appearance, boardMode}}
      await row.vm.$nextTick()
      expect(row.text().replace(/\s+/g, " ")).toContain("Ready for Agent → In Progress")
      expect(row.text()).not.toContain("Status:")
      expect(row.find('use[href="#bot"]').exists()).toBe(true)
      expect(row.find('use[href="#fire"]').exists()).toBe(true)
    }

    await row.setProps({event: makeEvent({type: "status_changed", fromStatus: "backlog", toStatus: "todo"})})
    expect(row.text().replace(/\s+/g, " ")).toContain("Backlog → To Do")
    expect(row.find('use[href="#bookmark"]').exists()).toBe(true)
    expect(row.find('use[href="#brain"]').exists()).toBe(true)

    await row.setProps({event: makeEvent({type: "status_changed", fromStatus: "ready_to_merge", toStatus: "done"})})
    expect(row.text().replace(/\s+/g, " ")).toContain("Ready to Merge → Done")
    expect(row.find('use[href="#git-pull-request"]').exists()).toBe(true)
    expect(row.find('use[href="#check-check"]').exists()).toBe(true)

    await row.setProps({event: makeEvent({type: "status_changed", fromStatus: "done", toStatus: "cancelled"})})
    expect(row.text().replace(/\s+/g, " ")).toContain("Done → Cancelled")
    expect(row.find('use[href="#archive"]').exists()).toBe(true)
  })

  it("shows scheduling and clearing a day as calendar endpoints without a prefix", async () => {
    const row = await renderEvent(makeEvent({type: "moved", toDate: "2026-10-31"}))
    expect(row.text().replace(/\s+/g, " ")).toContain("No date → Oct 31")
    expect(row.text()).not.toContain("Moved")
    expect(row.findAll('use[href="#calendar"]')).toHaveLength(2)

    await row.setProps({event: makeEvent({type: "moved", fromDate: "2026-10-31"})})
    expect(row.text().replace(/\s+/g, " ")).toContain("Oct 31 → No date")
    expect(row.text()).not.toContain("Moved")
    expect(row.findAll('use[href="#calendar"]')).toHaveLength(2)
  })

  it("names priority and project transitions without treating an unavailable project as No project", async () => {
    const row = await renderEvent(makeEvent({type: "priority_changed", fromPriority: "none", toPriority: "urgent"}))
    expect(row.text().replace(/\s+/g, " ")).toContain("No priority → Urgent")
    expect(row.text()).not.toContain("Priority:")

    const {useBranchesStore} = await import("../../../../src/renderer/src/stores/branches.store")
    const makeProject = () => ({
      id: "project-1",
      name: "Daily",
      description: "",
      createdAt: "",
      updatedAt: "",
      deletedAt: null,
    })
    useBranchesStore().branches = [makeProject()]
    await row.setProps({event: makeEvent({type: "project_changed", fromBranchId: "main", toBranchId: "project-1"})})
    expect(row.text().replace(/\s+/g, " ")).toContain("No project → Daily")
    expect(row.text()).not.toContain("Project:")

    await row.setProps({event: makeEvent({type: "project_changed", fromBranchId: "project-gone", toBranchId: "project-1"})})
    expect(row.text().replace(/\s+/g, " ")).toContain("project-gone → Daily")
    expect(row.text()).not.toContain("Project:")
  })

  it("keeps legacy status events readable without inventing previous values", async () => {
    const row = await renderEvent(makeEvent({type: "reactivated"}))
    expect(row.text()).toContain("Status changed")
    expect(row.text()).not.toContain("→")

    await row.setProps({event: makeEvent({type: "moved"})})
    expect(row.text()).toContain("Moved")
    expect(row.text()).not.toContain("→")
  })
})
