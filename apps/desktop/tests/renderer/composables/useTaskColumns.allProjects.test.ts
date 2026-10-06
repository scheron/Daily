// @vitest-environment happy-dom
// @ts-nocheck
import {nextTick} from "vue"
import {createPinia, setActivePinia} from "pinia"
import {afterEach, beforeEach, describe, expect, it, vi} from "vitest"

import {makeTask, mountBoardDrag, TODAY, yForIndex} from "../../helpers/boardDrag"
import {mockBridgeIPC} from "../../helpers/bridgeIPC"

describe("useTaskColumns — the all-projects mode", () => {
  let board = null

  beforeEach(() => {
    mockBridgeIPC()
    setActivePinia(createPinia())
  })

  afterEach(() => {
    board?.unmount()
    board = null
    document.body.innerHTML = ""
    vi.restoreAllMocks()
  })

  it("treats same-named tags of two projects as one filter", async () => {
    board = await mountBoardDrag([
      makeTask("main-work", {tags: [{id: "t-main", name: "work"}]}),
      makeTask("other-work", {branchId: "other", tags: [{id: "t-other", name: "work"}]}),
      makeTask("other-home", {branchId: "other", tags: [{id: "t-home", name: "home"}]}),
    ])
    const {useSettingsStore} = await import("../../../src/renderer/src/stores/settings.store")
    const {useFilterStore} = await import("../../../src/renderer/src/stores/filter.store")

    useSettingsStore().settings = {branch: {activeId: "main", isAllProjects: true}, layout: {sectionsCollapsed: {}}}
    useFilterStore().setActiveTags("t-main")
    await nextTick()

    const ids = Object.values(board.columns.tasksByStatus.value)
      .flat()
      .map((task) => task.id)
      .sort()
    expect(ids).toEqual(["main-work", "other-work"])
  })

  it("drops a card of one project before a card of another, against the neighbour it is shown beside", async () => {
    board = await mountBoardDrag([
      makeTask("x1", {orderIndex: 1024}),
      makeTask("y1", {branchId: "other", orderIndex: 2048}),
      makeTask("y2", {branchId: "other", orderIndex: 3072}),
      makeTask("x2", {orderIndex: 4096}),
    ])
    const {useSettingsStore} = await import("../../../src/renderer/src/stores/settings.store")
    useSettingsStore().settings = {branch: {activeId: "main", isAllProjects: true}, layout: {sectionsCollapsed: {}}}
    await nextTick()
    vi.useFakeTimers()

    board.startDrag(board.find("x2"), yForIndex(3))
    board.moveOver("active", yForIndex(2))
    board.release(yForIndex(2))

    expect(board.tasks.moveTaskByOrder).toHaveBeenCalledWith({
      taskId: "x2",
      targetStatus: "active",
      targetTaskId: "y2",
      position: "before",
      activeDate: TODAY,
      acrossProjects: true,
    })
    vi.useRealTimers()
  })
})
