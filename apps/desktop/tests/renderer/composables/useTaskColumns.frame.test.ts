// @vitest-environment happy-dom
// @ts-nocheck
import {nextTick} from "vue"
import {createPinia, setActivePinia} from "pinia"
import {afterEach, beforeEach, describe, expect, it, vi} from "vitest"

import {makeTask, mountBoardDrag} from "../../helpers/boardDrag"
import {mockBridgeIPC} from "../../helpers/bridgeIPC"

describe("useTaskColumns — the milestone frame", () => {
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

  it("shows every task of the active project, with a milestone or without, while no milestone is picked", async () => {
    board = await mountBoardDrag(
      [
        makeTask("with-milestone"),
        makeTask("without-milestone", {milestoneId: null}),
        makeTask("backlog", {milestoneId: null, status: "backlog", scheduled: null}),
        makeTask("other-project", {branchId: "other"}),
      ],
      {frame: "milestone"},
    )

    const byStatus = board.columns.tasksByStatus.value
    expect(
      Object.values(byStatus)
        .flat()
        .map((task) => task.id)
        .sort(),
    ).toEqual(["backlog", "with-milestone", "without-milestone"])
  })

  it("shows every status of the active project's tasks without a milestone once no milestone is framed", async () => {
    board = await mountBoardDrag(
      [
        makeTask("with-milestone"),
        makeTask("active", {milestoneId: null}),
        makeTask("backlog", {milestoneId: null, status: "backlog", scheduled: null}),
        makeTask("done-long-ago", {milestoneId: null, status: "done", scheduled: {date: "2020-01-01", time: "09:00", timezone: "UTC"}}),
        makeTask("other-project", {milestoneId: null, branchId: "other"}),
      ],
      {frame: "milestone"},
    )
    const {useFilterStore} = await import("../../../src/renderer/src/stores/filter.store")

    useFilterStore().toggleNoMilestone()
    await nextTick()

    const byStatus = board.columns.tasksByStatus.value
    expect(
      Object.values(byStatus)
        .flat()
        .map((task) => task.id)
        .sort(),
    ).toEqual(["active", "backlog", "done-long-ago"])
  })
})
