// @vitest-environment happy-dom
// @ts-nocheck
import {nextTick} from "vue"
import {DateTime} from "luxon"
import {createPinia, setActivePinia} from "pinia"
import {afterEach, beforeEach, describe, expect, it} from "vitest"

import {mount} from "@vue/test-utils"
import {mockBridgeIPC} from "../../../helpers/bridgeIPC"

function makeTask(overrides = {}) {
  return {
    id: "task-1",
    branchId: "main",
    milestoneId: null,
    status: "active",
    content: "task",
    minimized: false,
    orderIndex: 1024,
    scheduled: {date: DateTime.now().toISODate(), time: "09:00", timezone: "UTC"},
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

describe("TaskBoard", () => {
  let wrapper = null

  beforeEach(() => {
    mockBridgeIPC()
    setActivePinia(createPinia())
  })

  afterEach(() => {
    wrapper?.unmount()
    wrapper = null
  })

  async function setup() {
    const {default: TaskBoard} = await import("../../../../src/renderer/src/ui/modules/TaskBoard")
    const {default: NoTasksPlaceholder} = await import("../../../../src/renderer/src/ui/modules/TaskBoard/{fragments}/NoTasksPlaceholder.vue")
    const {useTasksStore} = await import("../../../../src/renderer/src/stores/tasks/tasks.store")
    const {useDragDropStore} = await import("../../../../src/renderer/src/stores/dragDrop.store")
    const {useSettingsStore} = await import("../../../../src/renderer/src/stores/settings.store")

    const settings = useSettingsStore()
    settings.settings = {branch: {activeId: "main"}}

    function mountBoard() {
      wrapper = mount(TaskBoard, {attachTo: document.body, global: {directives: {tooltip: {}}}})
      return wrapper
    }

    return {NoTasksPlaceholder, mountBoard, settings, tasks: useTasksStore(), drag: useDragDropStore()}
  }

  it("keeps the columns mounted while a drag is in flight, even when the dragged task was the last one on the board", async () => {
    const {NoTasksPlaceholder, mountBoard, tasks, drag} = await setup()
    tasks.activeDay = DateTime.now().toISODate()
    tasks.tasks = [makeTask()]

    const board = mountBoard()
    expect(board.findComponent(NoTasksPlaceholder).exists()).toBe(false)

    drag.setDraggingTaskId("task-1")
    await nextTick()

    tasks.tasks = [makeTask({scheduled: {date: "2099-01-01", time: "09:00", timezone: "UTC"}})]
    await nextTick()

    expect(board.findComponent(NoTasksPlaceholder).exists()).toBe(false)
  })

  it("keeps a column's tasks mounted when the column collapses mid-drag", async () => {
    const {mountBoard, settings, tasks, drag} = await setup()
    const today = DateTime.now().toISODate()
    tasks.activeDay = today
    tasks.tasks = [makeTask(), makeTask({id: "task-2", status: "done"})]

    const board = mountBoard()
    await nextTick()
    expect(board.findAll("[data-task-card]")).toHaveLength(2)

    drag.setDraggingTaskId("task-1")
    await nextTick()

    settings.settings = {branch: {activeId: "main"}, layout: {sectionsCollapsed: {done: true}}}
    await nextTick()

    expect(board.findAll("[data-task-card]")).toHaveLength(2)
  })

  it("switching to the milestone frame mounts its cards without rewriting the document's stylesheets", async () => {
    const {mountBoard, tasks} = await setup()
    const {useFilterStore} = await import("../../../../src/renderer/src/stores/filter.store")
    const {useMilestonesStore} = await import("../../../../src/renderer/src/stores/milestones.store")
    const today = DateTime.now().toISODate()
    tasks.activeDay = today
    tasks.tasks = Array.from({length: 10}, (_, index) =>
      makeTask({
        id: `task-${index}`,
        milestoneId: "milestone-1",
        scheduled: {date: index === 0 ? today : "2099-01-01", time: "09:00", timezone: "UTC"},
      }),
    )
    useMilestonesStore().milestones = [
      {
        id: "milestone-1",
        branchId: "main",
        name: "Launch",
        description: "",
        targetDate: null,
        orderIndex: 1024,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
        deletedAt: null,
      },
    ]

    const board = mountBoard()
    await nextTick()
    expect(board.findAll("[data-task-card]")).toHaveLength(1)

    const headMutations = []
    const headObserver = new MutationObserver((records) => headMutations.push(...records))
    headObserver.observe(document.head, {childList: true, characterData: true, subtree: true})
    useFilterStore().setFrame("milestone")
    await nextTick()
    await new Promise((resolve) => setTimeout(resolve))
    headMutations.push(...headObserver.takeRecords())
    headObserver.disconnect()

    expect(board.findAll("[data-task-card]")).toHaveLength(10)
    expect(headMutations).toHaveLength(0)
  })
})
