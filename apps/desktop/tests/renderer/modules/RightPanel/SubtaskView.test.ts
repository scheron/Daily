// @vitest-environment happy-dom
// @ts-nocheck
import {defineComponent, h} from "vue"
import {createPinia, setActivePinia} from "pinia"
import {afterEach, beforeEach, describe, expect, it, vi} from "vitest"

import {mount} from "@vue/test-utils"
import {mockBridgeIPC} from "../../../helpers/bridgeIPC"

vi.mock("vue-toasts-lite", () => ({toasts: {error: vi.fn(), success: vi.fn()}}))

const Editor = defineComponent({
  name: "MarkdownEditor",
  props: {content: String, attachments: Boolean, grow: Boolean},
  emits: ["update:content"],
  setup(props, {emit, expose}) {
    expose({focus: () => undefined})
    return () => h("textarea", {value: props.content, onInput: (event) => emit("update:content", event.target.value)})
  },
})

vi.mock("../../../../src/renderer/src/ui/common/misc/MarkdownEditor", () => ({default: Editor}))

function makeTask(id) {
  return {
    id,
    branchId: "main",
    milestoneId: null,
    status: "in_progress",
    content: "task",
    minimized: false,
    orderIndex: 1024,
    scheduled: null,
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
    content: `subtask ${id}`,
    done: false,
    orderKey: id,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    deletedAt: null,
    ...overrides,
  }
}

describe("SubtaskView", () => {
  let wrapper = null
  let bridge = null

  beforeEach(() => {
    setActivePinia(createPinia())
  })

  afterEach(() => {
    wrapper?.unmount()
    wrapper = null
  })

  const settle = () => new Promise((resolve) => setTimeout(resolve, 0))
  const waitForDebounce = () => new Promise((resolve) => setTimeout(resolve, 450))

  async function setup(list, overrides = {}) {
    bridge = mockBridgeIPC({
      "tasks:get-one": vi.fn(async (id) => makeTask(id)),
      "subtasks:get-by-task": vi.fn(async (id) => (id === "task-1" ? list : [])),
      "subtasks:create": vi.fn().mockResolvedValue({}),
      "subtasks:update": vi.fn().mockResolvedValue({}),
      "subtasks:delete": vi.fn().mockResolvedValue({}),
      "subtasks:make-task": vi.fn().mockResolvedValue(null),
      ...overrides,
    })
    const {useTaskEditorStore} = await import("../../../../src/renderer/src/stores/task-editor")
    const {useSubtasksStore} = await import("../../../../src/renderer/src/stores/subtasks.store")
    const {openedSubtaskId} = await import("../../../../src/renderer/src/ui/modules/RightPanel/composables/useSubtaskEditorOpen")
    const editor = useTaskEditorStore()
    await editor.open("task-1")
    await settle()
    const {default: SubtaskView} = await import("../../../../src/renderer/src/ui/modules/RightPanel/{fragments}/SubtaskView")
    wrapper = mount(SubtaskView, {props: {subtaskId: "a"}, global: {directives: {tooltip: {}}}})
    await settle()
    return {editor, subtasksStore: useSubtasksStore(), openedSubtaskId}
  }

  async function type(value) {
    await wrapper.find("textarea").setValue(value)
  }

  it("lets_image_paste_and_drop_through_to_the_editor", async () => {
    await setup([makeSubtask("a")])

    expect(wrapper.findComponent(Editor).props("attachments")).toBe(true)
  })

  it("recreates_a_subtask_deleted_elsewhere_with_the_next_write_and_follows_it", async () => {
    const {subtasksStore, openedSubtaskId} = await setup([makeSubtask("a")])
    bridge["subtasks:create"].mockImplementation(async () => {
      subtasksStore.applyBroadcast({subtasks: {upserted: [makeSubtask("b", {content: "typed after"})]}})
      return {subtasks: {upserted: [makeSubtask("b", {content: "typed after"})]}}
    })
    subtasksStore.applyBroadcast({subtasks: {removed: ["a"]}})
    await settle()

    await type("typed after")
    await waitForDebounce()

    expect(bridge["subtasks:create"]).toHaveBeenCalledWith("task-1", "typed after")
    expect(bridge["subtasks:update"]).not.toHaveBeenCalled()
    expect(openedSubtaskId.value).toBe("b")
  })

  it("writes_what_is_typed_before_making_a_task", async () => {
    await setup([makeSubtask("a")])

    await type("typed just now")
    const button = wrapper.findAll("button").find((item) => item.text() === "Make a task")
    await button.trigger("click")
    await settle()

    expect(bridge["subtasks:update"]).toHaveBeenCalledWith("a", {content: "typed just now"})
    const order = [bridge["subtasks:update"], bridge["subtasks:make-task"]].map((fn) => fn.mock.invocationCallOrder[0])
    expect(order[0]).toBeLessThan(order[1])
  })

  it("keeps_a_pending_subtask_edit_when_the_new_task_is_saved_at_once", async () => {
    const {editor} = await setup([])
    wrapper.unmount()
    editor.openNew({branchId: "main"})
    editor.patch({content: "fresh"})
    editor.addPendingSubtask("first")
    const id = editor.pendingSubtasks[0].id
    const {default: SubtaskView} = await import("../../../../src/renderer/src/ui/modules/RightPanel/{fragments}/SubtaskView")
    wrapper = mount(SubtaskView, {props: {subtaskId: id}, global: {directives: {tooltip: {}}}})
    await settle()
    editor.commit = editor.commit.bind(editor)
    const {useTasksStore} = await import("../../../../src/renderer/src/stores/tasks/tasks.store")
    useTasksStore().createTask = vi.fn().mockResolvedValue({id: "new-task"})
    bridge["subtasks:create"].mockResolvedValue({subtasks: {upserted: [makeSubtask("s")]}})

    await type("first, edited")
    await editor.commit()

    expect(bridge["subtasks:create"]).toHaveBeenCalledWith("new-task", "first, edited")
  })

  it("writes_to_its_own_subtask_when_the_panel_moves_to_another_task", async () => {
    const {editor} = await setup([makeSubtask("a")])

    await type("typed late")
    await editor.open("task-2")
    await waitForDebounce()

    expect(bridge["subtasks:create"]).not.toHaveBeenCalled()
    expect(bridge["subtasks:update"]).toHaveBeenCalledWith("a", {content: "typed late"})
  })

  it("writes_to_the_id_directly_when_unmounted_after_the_panel_moved_on", async () => {
    const {editor} = await setup([makeSubtask("a")])

    await type("typed late")
    await editor.open("task-2")
    wrapper.unmount()
    wrapper = null
    await settle()

    expect(bridge["subtasks:create"]).not.toHaveBeenCalled()
    expect(bridge["subtasks:update"]).toHaveBeenCalledWith("a", {content: "typed late"})
  })

  it("does_not_recreate_a_subtask_that_delete_removed_while_a_write_was_queued", async () => {
    const releases = []
    let subtasksStore
    const {openedSubtaskId, ...rest} = await setup([makeSubtask("a")], {
      "subtasks:update": vi.fn(() => new Promise((resolve) => releases.push(() => resolve({})))),
      "subtasks:delete": vi.fn(async () => {
        subtasksStore.applyBroadcast({subtasks: {removed: ["a"]}})
        return {subtasks: {removed: ["a"]}}
      }),
    })
    subtasksStore = rest.subtasksStore
    openedSubtaskId.value = "a"

    await type("first")
    await waitForDebounce()
    wrapper.find("input[type=checkbox], [role=checkbox]").exists()
    await wrapper.find("label").trigger("click")
    const {default: ConfirmPopup} = await import("../../../../src/renderer/src/ui/overlays/ConfirmPopup.vue")
    wrapper.findComponent(ConfirmPopup).vm.$emit("confirm")
    await settle()
    releases.forEach((release) => release())
    await settle()
    releases.forEach((release) => release())
    await settle()

    expect(bridge["subtasks:create"]).not.toHaveBeenCalled()
    expect(openedSubtaskId.value).toBe(null)
  })

  it("makes_a_task_after_an_earlier_write_failed", async () => {
    await setup([makeSubtask("a")], {"subtasks:update": vi.fn().mockRejectedValueOnce(new Error("boom")).mockResolvedValue({})})
    const click = async () => {
      await wrapper
        .findAll("button")
        .find((item) => item.text() === "Make a task")
        .trigger("click")
      await settle()
    }

    await type("typed")
    await click()
    expect(bridge["subtasks:make-task"]).not.toHaveBeenCalled()
    await click()

    expect(bridge["subtasks:make-task"]).toHaveBeenCalledWith("a")
  })

  it("keeps_what_is_typed_while_the_subtask_is_being_recreated", async () => {
    let release
    const {subtasksStore, openedSubtaskId} = await setup([makeSubtask("a")], {
      "subtasks:create": vi.fn(
        () => new Promise((resolve) => (release = () => resolve({subtasks: {upserted: [makeSubtask("b", {content: "x1"})]}}))),
      ),
    })
    subtasksStore.applyBroadcast({subtasks: {removed: ["a"]}})
    await settle()

    await type("x1")
    await waitForDebounce()
    await type("x1x2")
    await wrapper.vm.$nextTick()
    release()
    await settle()
    await waitForDebounce()

    expect(wrapper.find("textarea").element.value).toBe("x1x2")
    expect(openedSubtaskId.value).toBe("b")
    expect(bridge["subtasks:update"]).toHaveBeenCalledWith("b", {content: "x1x2"})
  })

  it("follows_the_row_the_create_call_returned_not_one_another_window_added", async () => {
    const {subtasksStore, openedSubtaskId} = await setup([makeSubtask("a")])
    bridge["subtasks:create"].mockImplementation(async () => {
      subtasksStore.applyBroadcast({subtasks: {upserted: [makeSubtask("c", {orderKey: "0"})]}})
      return {subtasks: {upserted: [makeSubtask("b", {orderKey: "z"})]}}
    })
    subtasksStore.applyBroadcast({subtasks: {removed: ["a"]}})
    await settle()

    await type("typed")
    await waitForDebounce()

    expect(openedSubtaskId.value).toBe("b")
  })
})
