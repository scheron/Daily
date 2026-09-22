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

describe("RightPanel tabs", () => {
  let wrapper = null

  beforeEach(() => {
    mockBridgeIPC({
      "tasks:get-one": vi.fn(async (id) => makeTask(id)),
      "comments:get-by-task": vi.fn().mockResolvedValue([]),
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
        stubs: {Toolbar: true, Details: true, Editor: true, Footer: true, Comments: true, History: true},
      },
    })

    await wrapper.vm.$nextTick()
    return {taskEditorStore}
  }

  function tabLabels() {
    return wrapper.findAll("button").map((tab) => tab.text())
  }

  async function clickTab(label) {
    const tab = wrapper.findAll("button").find((button) => button.text().startsWith(label))
    await tab.trigger("click")
    await wrapper.vm.$nextTick()
  }

  it("opens_a_saved_task_on_the_editor_with_all_three_tabs_offered", async () => {
    await setup((store) => store.open("task-1"))

    expect(tabLabels()).toEqual(["Editor", "Comments", "History"])
    expect(wrapper.find("editor-stub").exists()).toBe(true)
    expect(wrapper.find("comments-stub").exists()).toBe(false)
    expect(wrapper.find("history-stub").exists()).toBe(false)
  })

  it("swaps_the_body_for_the_tab_that_was_picked_showing_one_at_a_time", async () => {
    await setup((store) => store.open("task-1"))

    await clickTab("Comments")
    expect(wrapper.find("comments-stub").exists()).toBe(true)
    expect(wrapper.find("editor-stub").exists()).toBe(false)
    expect(wrapper.find("history-stub").exists()).toBe(false)

    await clickTab("History")
    expect(wrapper.find("history-stub").exists()).toBe(true)
    expect(wrapper.find("comments-stub").exists()).toBe(false)
  })

  it("offers_no_tabs_on_a_task_that_was_never_saved_leaving_only_the_editor", async () => {
    await setup((store) => store.openNew({branchId: "main", milestoneId: null}))

    expect(tabLabels()).toEqual([])
    expect(wrapper.find("editor-stub").exists()).toBe(true)
  })

  it("returns_to_the_editor_when_the_panel_moves_on_to_another_task", async () => {
    const {taskEditorStore} = await setup((store) => store.open("task-1"))

    await clickTab("History")
    expect(wrapper.find("history-stub").exists()).toBe(true)

    await taskEditorStore.open("task-2")
    await wrapper.vm.$nextTick()

    expect(wrapper.find("editor-stub").exists()).toBe(true)
    expect(wrapper.find("history-stub").exists()).toBe(false)
  })
})
