// @vitest-environment happy-dom
// @ts-nocheck
import {Settings} from "luxon"
import {createPinia, setActivePinia} from "pinia"
import {afterEach, beforeEach, describe, expect, it, vi} from "vitest"

import {mount} from "@vue/test-utils"
import {mockBridgeIPC} from "../../../helpers/bridgeIPC"

function makeTask(id, overrides = {}) {
  return {
    id,
    branchId: "main",
    milestoneId: null,
    status: "in_progress",
    content: "task",
    minimized: false,
    orderIndex: 1024,
    scheduled: "2026-01-01",
    estimatedTime: 0,
    spentTime: 0,
    tags: [],
    attachments: [],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    deletedAt: null,
    ...overrides,
  }
}

function makeComment(id, createdAt, overrides = {}) {
  return {
    id,
    taskId: "task-1",
    branchId: "main",
    content: `comment ${id}`,
    kind: "manual",
    provider: null,
    createdAt,
    updatedAt: createdAt,
    deletedAt: null,
    ...overrides,
  }
}

describe("Activity", () => {
  let wrapper = null
  let bridge = null
  let previousZone

  beforeEach(() => {
    previousZone = Settings.defaultZone
    Settings.defaultZone = "Asia/Vladivostok"
    setActivePinia(createPinia())
  })

  afterEach(() => {
    wrapper?.unmount()
    wrapper = null
    bridge = null
    Settings.defaultZone = previousZone
  })

  async function setup(thread, overrides = {}) {
    const {history, ...handlers} = overrides
    bridge = mockBridgeIPC({
      "tasks:get-one": vi.fn(async (id) => makeTask(id)),
      "activity:get-by-task": vi.fn().mockResolvedValue(history ?? []),
      "comments:get-by-task": vi.fn().mockResolvedValue(thread),
      "comments:create": vi.fn().mockResolvedValue({}),
      "comments:update": vi.fn().mockResolvedValue({}),
      "comments:delete": vi.fn().mockResolvedValue({}),
      ...handlers,
    })

    const {useTaskEditorStore} = await import("../../../../src/renderer/src/stores/task-editor")
    await useTaskEditorStore().open("task-1")

    const {useTasksStore} = await import("../../../../src/renderer/src/stores/tasks")
    useTasksStore().tasks = [makeTask("task-1")]

    const {default: Comments} = await import("../../../../src/renderer/src/ui/modules/RightPanel/{fragments}/Comments")

    const {default: Footer} = await import("../../../../src/renderer/src/ui/modules/RightPanel/{fragments}/Footer.vue")
    const {defineComponent, h} = await import("vue")

    wrapper = mount(defineComponent({render: () => [h(Comments), h(Footer)]}), {attachTo: document.body, global: {directives: {tooltip: {}}}})
    await flush()
  }

  async function flush() {
    await new Promise((resolve) => setTimeout(resolve, 0))
    await wrapper.vm.$nextTick()
  }

  function rowTexts() {
    return wrapper.findAll(".group").map((row) => row.text())
  }

  function buttonWithIcon(name) {
    return wrapper.findAll("button").find((button) => button.find(`use[href="#${name}"]`).exists())
  }

  it("shows newest activity first by default", async () => {
    await setup([
      makeComment("old", "2026-01-01T09:00:00.000Z"),
      makeComment("middle", "2026-01-01T10:00:00.000Z"),
      makeComment("new", "2026-01-01T11:00:00.000Z"),
    ])

    expect(rowTexts().map((text) => text.replace(/\s+/g, " ").trim())).toEqual([
      expect.stringContaining("comment new"),
      expect.stringContaining("comment middle"),
      expect.stringContaining("comment old"),
    ])
  })

  it("reverses days and entries while keeping the comments filter independent", async () => {
    await setup(
      [
        makeComment("old", "2026-01-01T09:00:00.000Z"),
        makeComment("middle", "2026-01-02T09:00:00.000Z"),
        makeComment("new", "2026-01-02T10:00:00.000Z"),
      ],
      {
        history: [{id: "e1", taskId: "task-1", type: "created", createdAt: "2025-12-31T09:00:00.000Z"}],
      },
    )

    const sortButton = buttonWithIcon("arrow-up-down")
    const sortControl = wrapper.findAllComponents({name: "BaseButton"}).find((button) => button.props("icon") === "arrow-up-down")
    expect(sortButton?.attributes("aria-pressed")).toBe("true")
    expect(sortControl.props("tooltip")).toBe("Oldest first")
    await sortButton.trigger("click")

    expect(sortButton.attributes("aria-pressed")).toBe("false")
    expect(sortControl.props("tooltip")).toBe("Newest first")
    expect(wrapper.findAll("h3").map((heading) => heading.text())).toEqual(["Dec 31, 2025", "Jan 1, 2026", "Jan 2, 2026"])
    expect(rowTexts()).toEqual([
      expect.stringContaining("comment old"),
      expect.stringContaining("comment middle"),
      expect.stringContaining("comment new"),
    ])

    await wrapper.find('[aria-label="Only comments"]').trigger("click")
    expect(wrapper.findAll("h3").map((heading) => heading.text())).toEqual(["Jan 1, 2026", "Jan 2, 2026"])
    expect(sortButton.attributes("aria-pressed")).toBe("false")
    await sortButton.trigger("click")
    expect(sortButton.attributes("aria-pressed")).toBe("true")
    expect(sortControl.props("tooltip")).toBe("Oldest first")
    expect(wrapper.findAll("h3").map((heading) => heading.text())).toEqual(["Jan 2, 2026", "Jan 1, 2026"])
    expect(rowTexts()).toEqual([
      expect.stringContaining("comment new"),
      expect.stringContaining("comment middle"),
      expect.stringContaining("comment old"),
    ])
    expect(wrapper.text()).not.toContain("Created")
  })

  it("groups the local midnight and year boundary once per day, including timestamps with an ISO offset", async () => {
    await setup([
      makeComment("before", "2026-12-31T13:59:00.000Z"),
      makeComment("after", "2026-12-31T14:01:00.000Z"),
      makeComment("offset", "2027-01-01T04:00:00+14:00"),
    ])

    const groups = wrapper.findAll("section[aria-labelledby]")
    expect(groups.map((group) => group.find("h3").text())).toEqual(["Jan 1, 2027", "Dec 31, 2026"])
    expect(groups[1].text()).toContain("comment before")
    expect(groups[1].text()).not.toContain("comment after")
    expect(groups[0].text()).toContain("comment after")
    expect(groups[0].text()).toContain("comment offset")
  })

  it("removes days without comments when Only comments hides their events", async () => {
    await setup([makeComment("c1", "2027-01-01T01:00:00.000Z")], {
      history: [{id: "e1", taskId: "task-1", type: "created", createdAt: "2026-12-30T01:00:00.000Z"}],
    })

    expect(wrapper.findAll("h3").map((heading) => heading.text())).toEqual(["Jan 1, 2027", "Dec 30, 2026"])
    await wrapper.find('[aria-label="Only comments"]').trigger("click")
    expect(wrapper.findAll("h3").map((heading) => heading.text())).toEqual(["Jan 1, 2027"])
    expect(wrapper.text()).toContain("comment c1")
  })

  it("invites_the_first_note_instead_of_drawing_an_empty_list", async () => {
    await setup([])

    expect(wrapper.text()).toContain("No activity yet")
    expect(wrapper.find("textarea").attributes("placeholder")).toBe("Write a comment…")
  })

  it("mixes_history_into_the_feed_by_time_and_drops_it_under_only_comments", async () => {
    await setup([makeComment("c1", "2026-01-01T10:00:00.000Z")], {
      history: [
        {id: "e2", taskId: "task-1", type: "completed", createdAt: "2026-01-01T11:00:00.000Z"},
        {id: "e1", taskId: "task-1", type: "created", createdAt: "2026-01-01T09:00:00.000Z"},
      ],
    })

    const text = () => wrapper.text().replace(/\s+/g, " ")
    expect(text().indexOf("Completed")).toBeLessThan(text().indexOf("comment c1"))
    expect(text().indexOf("comment c1")).toBeLessThan(text().indexOf("Created"))

    await wrapper.find('[aria-label="Only comments"]').trigger("click")

    expect(text()).toContain("comment c1")
    expect(text()).not.toContain("Created")
    expect(text()).not.toContain("Completed")
  })

  it("keeps simultaneous category events in a stable sequence and hides them under Only comments", async () => {
    const createdAt = "2026-01-01T09:00:00.000Z"
    const makeEvent = (id, type, sequence) => ({id, taskId: "task-1", type, sequence, createdAt})
    await setup([makeComment("c2", createdAt), makeComment("c1", createdAt)], {
      history: [makeEvent("z", "edited", 2), makeEvent("b", "created", 1), makeEvent("a", "restored", 1)],
    })

    const text = () => wrapper.text().replace(/\s+/g, " ")
    expect(text().indexOf("Edited")).toBeLessThan(text().indexOf("Created"))
    expect(text().indexOf("Created")).toBeLessThan(text().indexOf("Restored"))
    expect(text().indexOf("Restored")).toBeLessThan(text().indexOf("comment c2"))
    expect(text().indexOf("comment c2")).toBeLessThan(text().indexOf("comment c1"))

    await wrapper.find('[aria-label="Newest first"]').trigger("click")
    expect(text().indexOf("comment c1")).toBeLessThan(text().indexOf("comment c2"))
    expect(text().indexOf("comment c2")).toBeLessThan(text().indexOf("Restored"))
    expect(text().indexOf("Restored")).toBeLessThan(text().indexOf("Created"))
    expect(text().indexOf("Created")).toBeLessThan(text().indexOf("Edited"))

    await wrapper.find('[aria-label="Only comments"]').trigger("click")
    expect(text()).toContain("comment c1")
    expect(text()).not.toContain("Restored")
    expect(text()).not.toContain("Created")
    expect(text()).not.toContain("Edited")
  })

  it("keeps each source and exact transition on its own row in mixed Activity when the order changes", async () => {
    const makeEvent = (id, createdAt, overrides = {}) => ({
      id,
      taskId: "task-1",
      branchId: "main",
      type: "edited",
      eventDate: "2026-01-01",
      createdAt,
      kind: "mcp",
      provider: "Codex",
      ...overrides,
    })
    const legacy = makeEvent("legacy", "2026-01-01T08:00:00.000Z", {type: "created"})
    Reflect.deleteProperty(legacy, "kind")
    Reflect.deleteProperty(legacy, "provider")

    await setup([makeComment("between", "2026-01-01T10:30:00.000Z")], {
      history: [
        legacy,
        makeEvent("first-codex", "2026-01-01T09:00:00.000Z"),
        makeEvent("manual", "2026-01-01T10:00:00.000Z", {
          type: "priority_changed",
          kind: "manual",
          provider: null,
          fromPriority: "none",
          toPriority: "urgent",
        }),
        makeEvent("returning-codex", "2026-01-01T11:00:00.000Z", {
          type: "status_changed",
          fromStatus: "ready_for_agent",
          toStatus: "ready_to_merge",
        }),
        makeEvent("assistant", "2026-01-01T12:00:00.000Z", {
          type: "moved",
          kind: "agent",
          provider: "daily_agent",
          fromDate: "2026-01-01",
          toDate: "2026-01-02",
        }),
        makeEvent("unknown", "2026-01-01T13:00:00.000Z", {
          type: "project_changed",
          provider: "Cursor",
          fromBranchId: "main",
          toBranchId: "project-1",
        }),
      ],
    })

    const historyRows = () =>
      wrapper.findAll(".history-row").map((row) => ({
        source: row.element.querySelector("[data-source]")?.getAttribute("data-source") ?? null,
        at: row.get("time").attributes("datetime"),
        text: row.text().replace(/\s+/g, " "),
      }))
    const newestFirst = [
      {source: "Cursor", at: "2026-01-01T13:00:00.000Z", text: expect.stringContaining("No project → project-1")},
      {source: "Daily Assistant", at: "2026-01-01T12:00:00.000Z", text: expect.stringContaining("Jan 1 → Jan 2")},
      {source: "Codex", at: "2026-01-01T11:00:00.000Z", text: expect.stringContaining("Ready for Agent → Ready to Merge")},
      {source: null, at: "2026-01-01T10:00:00.000Z", text: expect.stringContaining("No priority → Urgent")},
      {source: "Codex", at: "2026-01-01T09:00:00.000Z", text: expect.stringContaining("Edited")},
      {source: null, at: "2026-01-01T08:00:00.000Z", text: expect.stringContaining("Created")},
    ]

    expect(historyRows()).toEqual(newestFirst)
    expect(rowTexts()).toEqual([expect.stringContaining("comment between")])

    await wrapper.get('[aria-label="Newest first"]').trigger("click")
    expect(historyRows()).toEqual([...newestFirst].reverse())
  })

  it("identifies manual comments and the Daily Assistant through accessible source icons", async () => {
    await setup([
      makeComment("typed", "2026-01-01T09:00:00.000Z"),
      makeComment("from-agent", "2026-01-01T10:00:00.000Z", {kind: "agent", provider: "daily_agent"}),
    ])

    const [, typedRow] = rowTexts()

    expect(wrapper.findAll("[role=img][aria-label]").map((source) => source.attributes("aria-label"))).toEqual(["Daily Assistant", "Comment"])
    expect(typedRow).not.toContain("Agent")
    expect(typedRow).not.toContain("MCP")
  })

  it("keeps real MCP provider names with known and fallback icons", async () => {
    await setup([
      makeComment("via-claude", "2026-01-01T09:00:00.000Z", {kind: "mcp", provider: "claude"}),
      makeComment("via-stranger", "2026-01-01T10:00:00.000Z", {kind: "mcp", provider: "some-new-client"}),
      makeComment("via-nobody", "2026-01-01T11:00:00.000Z", {kind: "mcp", provider: null}),
      makeComment("via-empty", "2026-01-01T12:00:00.000Z", {kind: "mcp", provider: "  "}),
    ])

    const [emptyRow, anonymousRow, strangerRow, claudeRow] = wrapper.findAll(".group")

    expect(claudeRow.find("[role=img]").attributes("aria-label")).toBe("claude")
    expect(claudeRow.find("use").attributes("href")).toBe("#claude")

    expect(strangerRow.find("[role=img]").attributes("aria-label")).toBe("some-new-client")
    expect(strangerRow.find("use").attributes("href")).toBe("#ai")

    expect(anonymousRow.find("[role=img]").attributes("aria-label")).toBe("MCP")
    expect(anonymousRow.find("use").attributes("href")).toBe("#ai")
    expect(emptyRow.find("[role=img]").attributes("aria-label")).toBe("MCP")
  })

  it("places a newly saved comment above existing activity", async () => {
    await setup([makeComment("existing", "2026-01-01T09:00:00.000Z")], {
      "comments:create": vi.fn(async (taskId, content) => ({
        comments: {upserted: [makeComment("written", "2026-01-01T12:00:00.000Z", {taskId, content})]},
      })),
    })

    await wrapper.find("textarea").setValue("  a note worth keeping  ")
    await buttonWithIcon("arrow-up").trigger("click")
    await flush()

    expect(bridge["comments:create"]).toHaveBeenCalledWith("task-1", "a note worth keeping")
    expect(rowTexts()).toEqual([expect.stringContaining("a note worth keeping"), expect.stringContaining("comment existing")])
  })

  it("sends_a_new_comment_on_cmd_enter", async () => {
    await setup([], {
      "comments:create": vi.fn(async (taskId, content) => ({
        comments: {upserted: [makeComment("written", "2026-01-01T12:00:00.000Z", {taskId, content})]},
      })),
    })

    await wrapper.find("textarea").setValue("sent from the keyboard")
    await wrapper.find("textarea").trigger("keydown", {key: "Enter", code: "Enter", metaKey: true})
    await flush()

    expect(bridge["comments:create"]).toHaveBeenCalledWith("task-1", "sent from the keyboard")
  })

  it("clears_the_composer_on_escape_without_sending", async () => {
    await setup([])

    await wrapper.find("textarea").setValue("half a thought")
    await wrapper.find("textarea").trigger("keydown", {key: "Escape", code: "Escape"})

    expect(wrapper.find("textarea").element.value).toBe("")
    expect(bridge["comments:create"]).not.toHaveBeenCalled()
  })

  it("focuses a tapped comment's content so its actions and time become reachable", async () => {
    await setup([makeComment("c1", "2026-01-01T09:00:00.000Z")])
    const row = wrapper.find(".group")
    await row.find(".comment-markdown").trigger("click")

    expect(document.activeElement).toBe(row.element)
    expect(row.findAll("time").map((time) => time.attributes("datetime"))).toEqual(["2026-01-01T09:00:00.000Z"])
  })

  it("keeps a comment when its deletion is cancelled", async () => {
    await setup([makeComment("c1", "2026-01-01T09:00:00.000Z")])
    await wrapper.find("button[aria-label='Delete comment']").trigger("click")
    const cancel = Array.from(document.body.querySelectorAll("[data-popup] button")).find((button) => button.textContent?.trim() === "Cancel")
    cancel.dispatchEvent(new Event("click", {bubbles: true}))
    await flush()

    expect(wrapper.text()).toContain("comment c1")
    expect(bridge["comments:delete"]).not.toHaveBeenCalled()
  })

  it("takes_a_comment_out_of_the_thread_once_the_delete_is_confirmed", async () => {
    await setup([makeComment("c1", "2026-01-01T09:00:00.000Z")], {
      "comments:delete": vi.fn(async (id) => ({comments: {removed: [id]}})),
    })

    await buttonWithIcon("trash").trigger("click")
    await wrapper.vm.$nextTick()

    const confirm = Array.from(document.body.querySelectorAll("[data-popup] button")).find((button) => button.textContent?.trim() === "Delete")
    confirm.dispatchEvent(new Event("click", {bubbles: true}))
    await flush()

    expect(bridge["comments:delete"]).toHaveBeenCalledWith("c1")
    expect(wrapper.text()).toContain("No activity yet")
  })
})
