// @vitest-environment happy-dom
// @ts-nocheck
import {toasts} from "vue-toasts-lite"
import {createPinia, setActivePinia} from "pinia"
import {afterEach, beforeEach, describe, expect, it, vi} from "vitest"

import {mount} from "@vue/test-utils"
import {mockBridgeIPC} from "../../../helpers/bridgeIPC"

vi.mock("vue-toasts-lite", () => ({toasts: {error: vi.fn(), success: vi.fn()}}))

let completionOpen = false

const EditorStub = {
  props: ["content", "placeholder", "readonly"],
  emits: ["update:content"],
  template: '<textarea :value="content" :placeholder="placeholder" :readonly="readonly" @input="$emit(\'update:content\', $event.target.value)" />',
  methods: {focus() {}, isCompletionOpen: () => completionOpen},
}

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

describe("Subtasks tab", () => {
  let wrapper = null
  let bridge = null

  beforeEach(() => {
    setActivePinia(createPinia())
    completionOpen = false
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

    wrapper = mount(Subtasks, {global: {directives: {tooltip: {}}, stubs: {MarkdownEditor: EditorStub}}})
    await flush()
  }

  async function flush() {
    await new Promise((resolve) => setTimeout(resolve, 0))
    await wrapper.vm.$nextTick()
  }

  function buttonWithIcon(name, root = wrapper) {
    return root.findAll("button").find((button) => button.find(`use[href="#${name}"]`).exists())
  }

  function radio(label, root = wrapper) {
    return root.findAll('[role="radio"]').find((button) => button.attributes("aria-label") === label)
  }

  function buttonWithText(text) {
    return wrapper.findAll("button").find((button) => button.text().trim() === text)
  }

  it("invites_the_first_subtask_instead_of_drawing_an_empty_list", async () => {
    await setup([])

    expect(wrapper.text()).toContain("No subtasks yet")
    expect(buttonWithText("Add subtask")).toBeDefined()
  })

  it("draws_every_subtask_expanded_in_the_order_storage_gave_them", async () => {
    await setup([makeSubtask("a"), makeSubtask("b")])

    const rows = wrapper.findAll(".group")

    expect(rows).toHaveLength(2)
    expect(rows[0].text()).toContain("subtask a")
    expect(rows[1].text()).toContain("subtask b")
    expect(wrapper.findAll(".subtask-first")).toHaveLength(0)
  })

  it("opens_a_full_area_editor_for_adding_with_the_list_and_the_button_hidden", async () => {
    await setup([makeSubtask("a")])

    await buttonWithText("Add subtask").trigger("click")

    expect(wrapper.find("textarea").exists()).toBe(true)
    expect(wrapper.find("textarea").attributes("placeholder")).toBeTruthy()
    expect(wrapper.findAll(".group")).toHaveLength(0)
    expect(buttonWithText("Add subtask")).toBeUndefined()
    expect(buttonWithText("Save")).toBeDefined()
    expect(wrapper.text()).not.toContain("to save")
  })

  it("appends_the_new_subtask_with_the_text_trimmed_and_returns_to_the_list", async () => {
    await setup([makeSubtask("a")], {
      "subtasks:create": vi.fn(async (taskId, content) => ({subtasks: {upserted: [makeSubtask("z", {taskId, content})]}})),
    })

    await buttonWithText("Add subtask").trigger("click")
    await wrapper.find("textarea").setValue("  Обновить changelog  ")
    await buttonWithText("Save").trigger("click")
    await flush()

    expect(bridge["subtasks:create"]).toHaveBeenCalledWith("task-1", "Обновить changelog")
    expect(wrapper.find("textarea").exists()).toBe(false)
    const rows = wrapper.findAll(".group")
    expect(rows).toHaveLength(2)
    expect(rows[1].text()).toContain("Обновить changelog")
  })

  it("discards_an_add_on_cancel_and_on_escape", async () => {
    await setup([makeSubtask("a")])

    await buttonWithText("Add subtask").trigger("click")
    await wrapper.find("textarea").setValue("draft")
    await buttonWithText("Cancel").trigger("click")

    expect(wrapper.find("textarea").exists()).toBe(false)

    await buttonWithText("Add subtask").trigger("click")
    await wrapper.find("textarea").setValue("draft")
    await wrapper.find("textarea").trigger("keydown", {key: "Escape", code: "Escape"})

    expect(wrapper.find("textarea").exists()).toBe(false)
    expect(wrapper.findAll(".group")).toHaveLength(1)
    expect(bridge["subtasks:create"]).not.toHaveBeenCalled()
  })

  it("saves_an_add_on_cmd_enter", async () => {
    await setup([], {
      "subtasks:create": vi.fn(async (taskId, content) => ({subtasks: {upserted: [makeSubtask("z", {taskId, content})]}})),
    })

    await buttonWithText("Add subtask").trigger("click")
    await wrapper.find("textarea").setValue("quick")
    await wrapper.find("textarea").trigger("keydown", {key: "Enter", code: "Enter", metaKey: true})
    await flush()

    expect(bridge["subtasks:create"]).toHaveBeenCalledWith("task-1", "quick")
  })

  it("keeps_the_editor_and_the_draft_and_reports_it_when_adding_fails", async () => {
    await setup([makeSubtask("a")], {"subtasks:create": vi.fn().mockRejectedValue(new Error("boom"))})

    await buttonWithText("Add subtask").trigger("click")
    await wrapper.find("textarea").setValue("keep me")
    await buttonWithText("Save").trigger("click")
    await flush()

    expect(wrapper.find("textarea").element.value).toBe("keep me")
    expect(toasts.error).toHaveBeenCalledWith("Failed to add the subtask")
  })

  it("keeps_the_editor_and_the_draft_and_reports_it_when_updating_fails", async () => {
    await setup([makeSubtask("a")], {"subtasks:update": vi.fn().mockRejectedValue(new Error("boom"))})

    await buttonWithIcon("pencil").trigger("click")
    await wrapper.find("textarea").setValue("edited")
    await buttonWithText("Save").trigger("click")
    await flush()

    expect(wrapper.find("textarea").element.value).toBe("edited")
    expect(toasts.error).toHaveBeenCalledWith("Failed to update the subtask")
  })

  it("keeps_the_draft_when_the_edited_subtask_is_removed_remotely_and_saves_it_as_a_new_one_on_the_parent", async () => {
    await setup([makeSubtask("a")], {
      "subtasks:create": vi.fn(async (taskId, content) => ({subtasks: {upserted: [makeSubtask("z", {taskId, content})]}})),
    })

    await buttonWithIcon("pencil").trigger("click")
    await wrapper.find("textarea").setValue("my draft")

    const {useSubtasksStore} = await import("../../../../src/renderer/src/stores/subtasks.store")
    useSubtasksStore().applyBroadcast({subtasks: {removed: ["a"]}})
    await flush()

    expect(wrapper.find("textarea").element.value).toBe("my draft")

    await buttonWithText("Save").trigger("click")
    await flush()

    expect(bridge["subtasks:update"]).not.toHaveBeenCalled()
    expect(bridge["subtasks:create"]).toHaveBeenCalledWith("task-1", "my draft")
    expect(wrapper.find("textarea").exists()).toBe(false)
    expect(wrapper.findAll(".group")[0].text()).toContain("my draft")
  })

  it("leaves_escape_to_an_open_completion_menu_and_cancels_on_the_next_one", async () => {
    await setup([makeSubtask("a")])

    await buttonWithText("Add subtask").trigger("click")
    await wrapper.find("textarea").setValue("draft")
    completionOpen = true
    await wrapper.find("textarea").trigger("keydown", {key: "Escape", code: "Escape"})

    expect(wrapper.find("textarea").element.value).toBe("draft")

    completionOpen = false
    await wrapper.find("textarea").trigger("keydown", {key: "Escape", code: "Escape"})

    expect(wrapper.find("textarea").exists()).toBe(false)
  })

  it("draws_no_chevron_and_no_drag_handle", async () => {
    await setup([makeSubtask("a")])

    expect(buttonWithIcon("chevron-down")).toBeUndefined()
    expect(buttonWithIcon("chevron-right")).toBeUndefined()
    expect(wrapper.find('use[href="#drag-vertical"]').exists()).toBe(false)
  })

  it("marks_a_subtask_done_through_the_toggle_keeping_it_in_place", async () => {
    await setup([makeSubtask("a"), makeSubtask("b")], {
      "subtasks:update": vi.fn(async (id, updates) => ({subtasks: {upserted: [makeSubtask(id, updates)]}})),
    })

    await radio("Done").trigger("click")
    await flush()

    expect(bridge["subtasks:update"]).toHaveBeenCalledWith("a", {done: true})
    expect(wrapper.findAll(".group")[0].classes()).toEqual(expect.arrayContaining(["border-success/30", "hover:border-success/40"]))
    expect(wrapper.findAll(".group")[0].text()).toContain("subtask a")
  })

  it("hides_the_list_the_button_and_the_subtask_header_while_one_is_edited_and_brings_them_back_on_cancel", async () => {
    await setup([makeSubtask("a"), makeSubtask("b")])

    await buttonWithIcon("pencil").trigger("click")

    expect(wrapper.findAll(".group")).toHaveLength(0)
    expect(radio("Done")).toBeUndefined()
    expect(radio("To do")).toBeUndefined()
    expect(buttonWithText("Add subtask")).toBeUndefined()
    expect(wrapper.find("textarea").element.value).toContain("subtask a")
    expect(buttonWithText("Save")).toBeDefined()

    await buttonWithText("Cancel").trigger("click")

    expect(wrapper.findAll(".group")).toHaveLength(2)
    expect(buttonWithText("Add subtask")).toBeDefined()
    expect(bridge["subtasks:update"]).not.toHaveBeenCalled()
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
    expect(wrapper.text()).toContain("No subtasks yet")
  })

  it("offers_make_a_task_on_a_checked_subtask_too", async () => {
    await setup([makeSubtask("a", {done: true})])

    await buttonWithIcon("external-link").trigger("click")
    await flush()

    expect(bridge["subtasks:make-task"]).toHaveBeenCalledWith("a")
  })

  it("opens_the_new_task_in_the_editor_once_it_is_made", async () => {
    await setup([makeSubtask("a")], {"subtasks:make-task": vi.fn().mockResolvedValue(makeTask("task-2"))})

    await buttonWithIcon("external-link").trigger("click")
    await flush()

    const {useTaskEditorStore} = await import("../../../../src/renderer/src/stores/task-editor")
    expect(useTaskEditorStore().editingTaskId).toBe("task-2")
  })

  it("keeps_the_current_task_open_when_making_a_task_fails", async () => {
    await setup([makeSubtask("a")], {"subtasks:make-task": vi.fn().mockRejectedValue(new Error("boom"))})

    await buttonWithIcon("external-link").trigger("click")
    await flush()

    const {useTaskEditorStore} = await import("../../../../src/renderer/src/stores/task-editor")
    expect(useTaskEditorStore().editingTaskId).toBe("task-1")
  })

  it("keeps_the_editor_when_the_completion_menu_closes_during_the_escape_and_cancels_on_the_next", async () => {
    await setup([makeSubtask("a")])

    await buttonWithText("Add subtask").trigger("click")
    await wrapper.find("textarea").setValue("draft")
    const closeMenu = (event) => {
      if (!completionOpen) return
      event.preventDefault()
      completionOpen = false
    }
    document.addEventListener("keydown", closeMenu)
    try {
      completionOpen = true
      const press = () => document.body.dispatchEvent(new KeyboardEvent("keydown", {key: "Escape", code: "Escape", bubbles: true, cancelable: true}))
      press()
      await flush()

      expect(wrapper.find("textarea").element.value).toBe("draft")

      press()
      await flush()
    } finally {
      document.removeEventListener("keydown", closeMenu)
    }

    expect(wrapper.find("textarea").exists()).toBe(false)
  })

  it("draws_the_toggle_as_fire_and_check_check_icons_without_visible_text", async () => {
    await setup([makeSubtask("a")])

    const [todo, done] = wrapper.findAll('[role="radio"]')

    expect(todo.find('use[href="#fire"]').exists()).toBe(true)
    expect(done.find('use[href="#check-check"]').exists()).toBe(true)
    expect(todo.text()).toBe("")
    expect(done.text()).toBe("")
    expect(todo.classes()).toContain("text-accent")
  })

  it("does_not_mute_or_strike_a_done_subtask", async () => {
    await setup([makeSubtask("a", {done: true})])

    const row = wrapper.find(".group")

    expect(row.classes()).toEqual(expect.arrayContaining(["rounded-2xl", "border", "border-success/30", "hover:border-success/40"]))
    expect(row.classes().some((name) => name.startsWith("opacity-"))).toBe(false)
    expect(wrapper.html()).not.toContain("subtask-done")
  })

  it("acts_as_the_editors_escape_from_anywhere_in_the_window_while_the_editor_is_open", async () => {
    await setup([makeSubtask("a")])

    await buttonWithText("Add subtask").trigger("click")
    await wrapper.find("textarea").setValue("draft")
    document.body.dispatchEvent(new KeyboardEvent("keydown", {key: "Escape", code: "Escape", bubbles: true, cancelable: true}))
    await flush()

    expect(wrapper.find("textarea").exists()).toBe(false)
  })

  it("ignores_a_window_escape_while_saving_and_keeps_the_editor", async () => {
    await setup([makeSubtask("a")], {"subtasks:update": vi.fn(() => new Promise(() => {}))})

    await buttonWithIcon("pencil").trigger("click")
    await wrapper.find("textarea").setValue("edited")
    await buttonWithText("Save").trigger("click")
    await wrapper.vm.$nextTick()
    const event = new KeyboardEvent("keydown", {key: "Escape", code: "Escape", bubbles: true, cancelable: true})
    document.body.dispatchEvent(event)
    await flush()

    expect(event.defaultPrevented).toBe(true)
    expect(wrapper.find("textarea").exists()).toBe(true)
  })

  it("leaves_a_window_escape_to_an_open_completion_menu", async () => {
    await setup([makeSubtask("a")])

    await buttonWithText("Add subtask").trigger("click")
    completionOpen = true
    document.body.dispatchEvent(new KeyboardEvent("keydown", {key: "Escape", code: "Escape", bubbles: true, cancelable: true}))
    await flush()

    expect(wrapper.find("textarea").exists()).toBe(true)
  })

  it("draws_a_to_do_done_toggle_reflecting_the_state_and_no_checkbox", async () => {
    await setup([makeSubtask("a"), makeSubtask("b", {done: true})])

    const rows = wrapper.findAll(".group")
    const active = (row) => row.findAll('[role="radio"][aria-checked="true"]').map((button) => button.attributes("aria-label"))

    expect(wrapper.findAll("button[aria-pressed]")).toHaveLength(0)
    expect(active(rows[0])).toEqual(["To do"])
    expect(active(rows[1])).toEqual(["Done"])
  })

  it("exposes_the_toggle_as_a_radio_group_named_after_the_subtask_with_the_chosen_option_checked", async () => {
    await setup([makeSubtask("a"), makeSubtask("b", {done: true})])

    const groups = wrapper.findAll('[role="radiogroup"]')
    const checked = (group) => group.findAll('[role="radio"][aria-checked="true"]').map((radio) => radio.attributes("aria-label"))

    expect(groups).toHaveLength(2)
    expect(groups[0].attributes("aria-label")).toContain("subtask a")
    expect(groups[1].attributes("aria-label")).toContain("subtask b")
    expect(checked(groups[0])).toEqual(["To do"])
    expect(checked(groups[1])).toEqual(["Done"])
  })

  it("writes_nothing_when_the_already_selected_option_is_picked", async () => {
    await setup([makeSubtask("a")])

    await radio("To do").trigger("click")
    await flush()

    expect(bridge["subtasks:update"]).not.toHaveBeenCalled()
  })

  it("ignores_cancel_and_escape_while_a_save_is_pending_and_keeps_the_draft_after_it_fails", async () => {
    let reject
    await setup([makeSubtask("a")], {"subtasks:update": vi.fn(() => new Promise((_, r) => (reject = r)))})

    await buttonWithIcon("pencil").trigger("click")
    await wrapper.find("textarea").setValue("edited")
    await buttonWithText("Save").trigger("click")
    await wrapper.vm.$nextTick()

    expect(buttonWithText("Cancel").attributes("aria-disabled")).toBe("true")
    expect(buttonWithText("Cancel").element.disabled).toBe(false)
    await buttonWithText("Cancel").trigger("click")
    await wrapper.find("textarea").trigger("keydown", {key: "Escape", code: "Escape"})

    expect(wrapper.find("textarea").exists()).toBe(true)
    expect(wrapper.find("textarea").element.value).toBe("edited")

    reject(new Error("boom"))
    await flush()

    expect(wrapper.find("textarea").element.value).toBe("edited")
    expect(buttonWithText("Cancel").attributes("aria-disabled")).toBeUndefined()
  })

  it("marks_a_subtask_to_do_again_from_the_toggle", async () => {
    await setup([makeSubtask("a", {done: true})], {
      "subtasks:update": vi.fn(async (id, updates) => ({subtasks: {upserted: [makeSubtask(id, updates)]}})),
    })

    await radio("To do").trigger("click")
    await flush()

    expect(bridge["subtasks:update"]).toHaveBeenCalledWith("a", {done: false})
    expect(wrapper.findAll(".group")[0].classes()).not.toContain("border-success/30")
  })

  it("makes_the_editor_read_only_while_a_save_is_pending_and_editable_again_after_a_failure", async () => {
    let reject
    await setup([makeSubtask("a")], {"subtasks:update": vi.fn(() => new Promise((_, r) => (reject = r)))})

    await buttonWithIcon("pencil").trigger("click")
    expect(wrapper.find("textarea").element.readOnly).toBe(false)

    await wrapper.find("textarea").setValue("edited")
    await buttonWithText("Save").trigger("click")
    await wrapper.vm.$nextTick()

    expect(wrapper.find("textarea").element.readOnly).toBe(true)

    reject(new Error("boom"))
    await flush()

    expect(wrapper.find("textarea").element.readOnly).toBe(false)
    expect(wrapper.find("textarea").element.value).toBe("edited")
  })

  it("keeps_the_editor_open_when_the_edited_subtask_is_removed_remotely_during_its_save", async () => {
    let resolve
    await setup([makeSubtask("a")], {
      "subtasks:update": vi.fn(() => new Promise((r) => (resolve = () => r({subtasks: {upserted: []}})))),
    })

    await buttonWithIcon("pencil").trigger("click")
    await wrapper.find("textarea").setValue("edited a")
    await buttonWithText("Save").trigger("click")

    const {useSubtasksStore} = await import("../../../../src/renderer/src/stores/subtasks.store")
    useSubtasksStore().applyBroadcast({subtasks: {removed: ["a"]}})
    resolve()
    await flush()

    expect(wrapper.find("textarea").element.value).toBe("edited a")
  })
})
