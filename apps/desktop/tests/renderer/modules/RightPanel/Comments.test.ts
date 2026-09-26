// @vitest-environment happy-dom
// @ts-nocheck
import {createPinia, setActivePinia} from "pinia"
import {afterEach, beforeEach, describe, expect, it, vi} from "vitest"

import {mount} from "@vue/test-utils"
import {mockBridgeIPC} from "../../../helpers/bridgeIPC"

function makeTask(id, overrides = {}) {
  return {
    id,
    branchId: "main",
    milestoneId: null,
    status: "active",
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

describe("Comments tab", () => {
  let wrapper = null
  let bridge = null

  beforeEach(() => {
    setActivePinia(createPinia())
  })

  afterEach(() => {
    wrapper?.unmount()
    wrapper = null
    bridge = null
  })

  async function setup(thread, overrides = {}) {
    bridge = mockBridgeIPC({
      "tasks:get-one": vi.fn(async (id) => makeTask(id)),
      "comments:get-by-task": vi.fn().mockResolvedValue(thread),
      "comments:create": vi.fn().mockResolvedValue({}),
      "comments:update": vi.fn().mockResolvedValue({}),
      "comments:delete": vi.fn().mockResolvedValue({}),
      ...overrides,
    })

    const {useTaskEditorStore} = await import("../../../../src/renderer/src/stores/task-editor")
    await useTaskEditorStore().open("task-1")

    const {default: Comments} = await import("../../../../src/renderer/src/ui/modules/RightPanel/{fragments}/Comments")

    wrapper = mount(Comments, {global: {directives: {tooltip: {}}}})
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

  function buttonWithText(text) {
    return wrapper.findAll("button").find((button) => button.text().trim() === text)
  }

  it("reads_a_thread_newest_first_so_the_latest_note_needs_no_scrolling", async () => {
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

  it("invites_the_first_note_instead_of_drawing_an_empty_list", async () => {
    await setup([])

    expect(wrapper.text()).toContain("No comments yet")
    expect(buttonWithText("Write a comment…")).toBeDefined()
  })

  it("badges_where_a_comment_came_from_and_leaves_a_hand_written_one_unmarked", async () => {
    await setup([
      makeComment("typed", "2026-01-01T09:00:00.000Z"),
      makeComment("from-agent", "2026-01-01T10:00:00.000Z", {kind: "agent", provider: "daily_agent"}),
    ])

    const [agentRow, typedRow] = rowTexts()

    expect(agentRow).toContain("Agent")
    expect(typedRow).not.toContain("Agent")
    expect(typedRow).not.toContain("MCP")
  })

  it("names_the_mcp_client_behind_a_comment_and_marks_one_it_has_never_heard_of_as_some_agent", async () => {
    await setup([
      makeComment("via-claude", "2026-01-01T09:00:00.000Z", {kind: "mcp", provider: "claude"}),
      makeComment("via-stranger", "2026-01-01T10:00:00.000Z", {kind: "mcp", provider: "some-new-client"}),
      makeComment("via-nobody", "2026-01-01T11:00:00.000Z", {kind: "mcp", provider: null}),
    ])

    const [anonymousRow, strangerRow, claudeRow] = wrapper.findAll(".group")

    expect(claudeRow.text()).toContain("claude")
    expect(claudeRow.find("use").attributes("href")).toBe("#claude")

    expect(strangerRow.text()).toContain("some-new-client")
    expect(strangerRow.find("use").attributes("href")).toBe("#ai")

    expect(anonymousRow.text()).toContain("MCP")
    expect(anonymousRow.find("use").attributes("href")).toBe("#ai")
  })

  it("writes_a_new_comment_on_the_open_task_and_shows_what_storage_answered", async () => {
    await setup([], {
      "comments:create": vi.fn(async (taskId, content) => ({
        comments: {upserted: [makeComment("written", "2026-01-01T12:00:00.000Z", {taskId, content})]},
      })),
    })

    await buttonWithText("Write a comment…").trigger("click")
    await wrapper.find("textarea").setValue("  a note worth keeping  ")
    await buttonWithText("Comment").trigger("click")
    await flush()

    expect(bridge["comments:create"]).toHaveBeenCalledWith("task-1", "a note worth keeping")
    expect(wrapper.text()).toContain("a note worth keeping")
  })

  it("sends_a_new_comment_on_cmd_enter", async () => {
    await setup([], {
      "comments:create": vi.fn(async (taskId, content) => ({
        comments: {upserted: [makeComment("written", "2026-01-01T12:00:00.000Z", {taskId, content})]},
      })),
    })

    await buttonWithText("Write a comment…").trigger("click")
    await wrapper.find("textarea").setValue("sent from the keyboard")
    await wrapper.find("textarea").trigger("keydown", {key: "Enter", code: "Enter", metaKey: true})
    await flush()

    expect(bridge["comments:create"]).toHaveBeenCalledWith("task-1", "sent from the keyboard")
  })

  it("drops_an_edit_on_escape_and_keeps_the_comment_as_it_was", async () => {
    await setup([makeComment("c1", "2026-01-01T09:00:00.000Z", {content: "first draft"})], {
      "comments:update": vi.fn(),
    })

    await buttonWithIcon("pencil").trigger("click")
    await wrapper.find("textarea").setValue("second draft")
    await wrapper.find("textarea").trigger("keydown", {key: "Escape", code: "Escape"})
    await flush()

    expect(bridge["comments:update"]).not.toHaveBeenCalled()
    expect(wrapper.find("textarea").exists()).toBe(false)
    expect(wrapper.text()).toContain("first draft")
  })

  it("rewrites_a_comment_in_place_and_shows_the_text_storage_answered_with", async () => {
    await setup([makeComment("c1", "2026-01-01T09:00:00.000Z", {content: "first draft"})], {
      "comments:update": vi.fn(async (id, content) => ({
        comments: {upserted: [makeComment(id, "2026-01-01T09:00:00.000Z", {content})]},
      })),
    })

    await buttonWithIcon("pencil").trigger("click")
    await wrapper.find("textarea").setValue("second draft")
    await buttonWithText("Save").trigger("click")
    await flush()

    expect(bridge["comments:update"]).toHaveBeenCalledWith("c1", "second draft")
    expect(wrapper.text()).toContain("second draft")
    expect(wrapper.text()).not.toContain("first draft")
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
    expect(wrapper.text()).toContain("No comments yet")
  })
})
