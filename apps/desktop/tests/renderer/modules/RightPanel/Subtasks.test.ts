// @vitest-environment happy-dom
// @ts-nocheck
import {toasts} from "vue-toasts-lite"
import {createPinia, setActivePinia} from "pinia"
import {afterEach, beforeEach, describe, expect, it, vi} from "vitest"

import {mount} from "@vue/test-utils"
import {mockBridgeIPC} from "../../../helpers/bridgeIPC"

vi.mock("vue-toasts-lite", () => ({toasts: {error: vi.fn(), success: vi.fn()}}))

function makeTask(id) {
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
  }
}

function makeSubtask(id, overrides = {}) {
  return {
    id,
    taskId: "task-1",
    content: `# subtask ${id}\n\nbody of ${id}`,
    done: false,
    orderKey: id,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    deletedAt: null,
    ...overrides,
  }
}

describe("Subtasks section", () => {
  let wrapper = null
  let bridge = null

  beforeEach(() => {
    setActivePinia(createPinia())
    vi.mocked(toasts.error).mockClear()
  })

  afterEach(() => {
    wrapper?.unmount()
    wrapper = null
  })

  async function setup(list, overrides = {}) {
    bridge = mockBridgeIPC({
      "tasks:get-one": vi.fn(async (id) => makeTask(id)),
      "subtasks:get-by-task": vi.fn().mockResolvedValue(list),
      "subtasks:create": vi.fn().mockResolvedValue({}),
      "subtasks:update": vi.fn().mockResolvedValue({}),
      "subtasks:delete": vi.fn().mockResolvedValue({}),
      "subtasks:make-task": vi.fn().mockResolvedValue(null),
      ...overrides,
    })

    const {useTaskEditorStore} = await import("../../../../src/renderer/src/stores/task-editor")
    await useTaskEditorStore().open("task-1")

    const {default: Subtasks} = await import("../../../../src/renderer/src/ui/modules/RightPanel/{fragments}/Subtasks")

    wrapper = mount(Subtasks, {global: {directives: {tooltip: {}}}})
    await flush()
  }

  async function flush() {
    await new Promise((resolve) => setTimeout(resolve, 0))
    await wrapper.vm.$nextTick()
  }

  function buttonWithIcon(name, root = wrapper) {
    return root.findAll("button").find((button) => button.find(`use[href="#${name}"]`).exists())
  }

  function rows() {
    return wrapper.findAll(".group")
  }

  async function editFirstRow(value, key = "Enter") {
    await rows()[0].find("button.truncate").trigger("click")
    await flush()
    const input = rows()[0].find("input")
    await input.setValue(value)
    await input.trigger("keydown", {key})
    await flush()
  }

  it("shows_the_done_count_in_the_header_and_nothing_for_an_empty_list", async () => {
    await setup([makeSubtask("a"), makeSubtask("b", {done: true})])
    const {useSubtasksStore} = await import("../../../../src/renderer/src/stores/subtasks.store")
    useSubtasksStore().subtaskCounts = {"task-1": {done: 1, total: 2}}
    await flush()
    expect(wrapper.text()).toContain("1/2")
    useSubtasksStore().subtaskCounts = {}
    await flush()
    wrapper.unmount()

    await setup([])
    expect(wrapper.text()).not.toContain("/")
    expect(wrapper.text()).toContain("Subtasks")
  })

  it("draws_one_line_rows_with_the_first_line_without_markdown_marks", async () => {
    await setup([makeSubtask("a"), makeSubtask("b")])

    expect(rows()).toHaveLength(2)
    expect(rows()[0].text()).toContain("subtask a")
    expect(rows()[0].text()).not.toContain("#")
    expect(rows()[0].text()).not.toContain("body of a")
    expect(buttonWithIcon("pencil")).toBeUndefined()
  })

  it("marks_a_subtask_done_from_its_round_checkbox", async () => {
    await setup([makeSubtask("a")])

    await rows()[0].find("button").trigger("click")
    await flush()

    expect(bridge["subtasks:update"]).toHaveBeenCalledWith("a", {done: true})
  })

  it("edits_only_the_first_line_and_keeps_the_rest", async () => {
    await setup([makeSubtask("a")])

    await editFirstRow("# renamed")

    expect(bridge["subtasks:update"]).toHaveBeenCalledWith("a", {content: "# renamed\n\nbody of a"})
  })

  it("writes_nothing_when_the_line_is_unchanged_or_emptied", async () => {
    await setup([makeSubtask("a")])

    await editFirstRow("# subtask a")
    await editFirstRow("   ")

    expect(bridge["subtasks:update"]).not.toHaveBeenCalled()
    expect(rows()[0].text()).toContain("subtask a")
  })

  it("drops_the_edit_on_escape_and_says_so_to_the_panel_while_it_lasts", async () => {
    await setup([makeSubtask("a")])
    const {useSubtaskEditorOpen} = await import("../../../../src/renderer/src/ui/modules/RightPanel/composables/useSubtaskEditorOpen")

    await rows()[0].find("button.truncate").trigger("click")
    await flush()
    expect(useSubtaskEditorOpen().value).toBe(true)

    const input = rows()[0].find("input")
    await input.setValue("zzz")
    const event = new KeyboardEvent("keydown", {key: "Escape", bubbles: true, cancelable: true})
    input.element.dispatchEvent(event)
    await flush()

    expect(event.defaultPrevented).toBe(true)
    expect(useSubtaskEditorOpen().value).toBe(false)
    expect(bridge["subtasks:update"]).not.toHaveBeenCalled()
    expect(rows()[0].find("input").exists()).toBe(false)
  })

  it("adds_a_row_in_edit_mode_from_the_plus_and_creates_it_on_enter", async () => {
    await setup([makeSubtask("a")], {
      "subtasks:create": vi.fn(async (taskId, content) => ({subtasks: {upserted: [makeSubtask("z", {taskId, content})]}})),
    })

    await buttonWithIcon("plus").trigger("click")
    await flush()
    const input = wrapper.find("input")
    await input.setValue("  Обновить changelog  ")
    await input.trigger("keydown", {key: "Enter"})
    await flush()

    expect(bridge["subtasks:create"]).toHaveBeenCalledWith("task-1", "Обновить changelog")
    expect(wrapper.find("input").exists()).toBe(false)
    expect(rows()).toHaveLength(2)
    expect(rows()[1].text()).toContain("Обновить changelog")
  })

  it("removes_a_new_row_on_escape_or_an_empty_blur", async () => {
    await setup([makeSubtask("a")])

    await buttonWithIcon("plus").trigger("click")
    await flush()
    wrapper.find("input").element.dispatchEvent(new KeyboardEvent("keydown", {key: "Escape", bubbles: true, cancelable: true}))
    await flush()
    expect(wrapper.find("input").exists()).toBe(false)

    await buttonWithIcon("plus").trigger("click")
    await flush()
    await wrapper.find("input").trigger("blur")
    await flush()

    expect(wrapper.find("input").exists()).toBe(false)
    expect(bridge["subtasks:create"]).not.toHaveBeenCalled()
  })

  it("reports_a_failed_add_with_a_toast", async () => {
    await setup([], {"subtasks:create": vi.fn().mockRejectedValue(new Error("boom"))})

    await buttonWithIcon("plus").trigger("click")
    await flush()
    await wrapper.find("input").setValue("x")
    await wrapper.find("input").trigger("keydown", {key: "Enter"})
    await flush()

    expect(toasts.error).toHaveBeenCalledWith("Failed to add the subtask")
  })

  it("hides_done_subtasks_with_the_toggle", async () => {
    await setup([makeSubtask("a"), makeSubtask("b", {done: true})])

    expect(rows()).toHaveLength(2)

    await wrapper.find("[aria-pressed]").trigger("click")

    expect(wrapper.find("[aria-pressed]").attributes("aria-pressed")).toBe("true")
    expect(rows()).toHaveLength(1)
    expect(rows()[0].text()).toContain("subtask a")
  })

  it("takes_a_subtask_out_once_the_delete_is_confirmed", async () => {
    await setup([makeSubtask("a")], {
      "subtasks:delete": vi.fn(async (id) => ({subtasks: {removed: [id]}})),
    })

    await buttonWithIcon("trash").trigger("click")
    await wrapper.vm.$nextTick()

    expect(bridge["subtasks:delete"]).not.toHaveBeenCalled()

    const confirm = Array.from(document.body.querySelectorAll("[data-popup] button")).find((button) => button.textContent?.trim() === "Delete")
    confirm.dispatchEvent(new Event("click", {bubbles: true}))
    await flush()

    expect(bridge["subtasks:delete"]).toHaveBeenCalledWith("a")
    expect(rows()).toHaveLength(0)
  })

  it("opens_the_subtask_view_from_the_chevron", async () => {
    await setup([makeSubtask("a")])
    const {openedSubtaskId} = await import("../../../../src/renderer/src/ui/modules/RightPanel/composables/useSubtaskEditorOpen")

    await buttonWithIcon("chevron-right").trigger("click")

    expect(openedSubtaskId.value).toBe("a")
  })
})
