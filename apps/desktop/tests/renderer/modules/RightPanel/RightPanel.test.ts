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

describe("RightPanel layout", () => {
  let wrapper = null

  beforeEach(() => {
    mockBridgeIPC({
      "tasks:get-one": vi.fn(async (id) => makeTask(id)),
      "comments:get-by-task": vi.fn().mockResolvedValue([]),
      "subtasks:get-by-task": vi.fn().mockResolvedValue([]),
    })
    setActivePinia(createPinia())
  })

  afterEach(() => {
    wrapper?.unmount()
    wrapper = null
  })

  async function setup(open) {
    const {useTaskEditorStore} = await import("../../../../src/renderer/src/stores/task-editor")
    const taskEditorStore = useTaskEditorStore()

    await open(taskEditorStore)

    const {default: RightPanel} = await import("../../../../src/renderer/src/ui/modules/RightPanel")

    wrapper = mount(RightPanel, {
      props: {width: 420},
      global: {
        directives: {tooltip: {}},
        stubs: {Toolbar: true, Details: true, Editor: true, Footer: true, Comments: true, History: true, Subtasks: true, SubtaskView: true},
      },
    })

    await wrapper.vm.$nextTick()
    return {taskEditorStore}
  }

  it("lays_a_saved_task_out_as_one_scroll_with_no_tabs_and_the_composer_in_the_footer", async () => {
    await setup((store) => store.open("task-1"))

    const scroller = wrapper.find(".overflow-y-auto")
    expect(wrapper.findAll("button")).toHaveLength(0)
    for (const section of ["details", "editor", "subtasks", "comments"]) expect(scroller.find(`${section}-stub`).exists()).toBe(true)
    expect(scroller.find("footer-stub").exists()).toBe(false)
    expect(wrapper.find("footer-stub").exists()).toBe(true)
    expect(wrapper.find("history-stub").exists()).toBe(false)
  })

  it("shows_subtasks_activity_and_the_composer_on_a_task_that_was_never_saved", async () => {
    await setup((store) => store.openNew({branchId: "main", milestoneId: null}))

    expect(wrapper.find("details-stub").exists()).toBe(true)
    expect(wrapper.find("editor-stub").exists()).toBe(true)
    expect(wrapper.find("subtasks-stub").exists()).toBe(true)
    expect(wrapper.find("comments-stub").exists()).toBe(true)
    expect(wrapper.find("footer-stub").exists()).toBe(true)
  })

  it("swaps_the_task_for_the_subtask_view_and_keeps_the_scroller_mounted", async () => {
    await setup((store) => store.open("task-1"))
    const {openedSubtaskId} = await import("../../../../src/renderer/src/ui/modules/RightPanel/composables/useSubtaskEditorOpen")

    openedSubtaskId.value = "s1"
    await wrapper.vm.$nextTick()

    expect(wrapper.find("subtask-view-stub").exists()).toBe(true)
    expect(wrapper.find(".overflow-y-auto").element.style.display).toBe("none")

    openedSubtaskId.value = null
    await wrapper.vm.$nextTick()

    expect(wrapper.find("subtask-view-stub").exists()).toBe(false)
    expect(wrapper.find(".overflow-y-auto").element.style.display).not.toBe("none")
  })
})
