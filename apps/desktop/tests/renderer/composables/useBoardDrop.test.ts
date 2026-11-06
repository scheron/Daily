// @vitest-environment happy-dom
// @ts-nocheck
import {nextTick} from "vue"
import {createPinia, setActivePinia} from "pinia"
import {afterEach, beforeEach, describe, expect, it, vi} from "vitest"

import {makeColumn, mountBoardDrag, TODAY, yForIndex} from "../../helpers/boardDrag"
import {mockBridgeIPC} from "../../helpers/bridgeIPC"

describe("useBoardDrop — release target ownership", () => {
  let board = null
  let bridge = null

  beforeEach(() => {
    bridge = mockBridgeIPC({
      "tasks:update": vi.fn().mockResolvedValue({}),
      "tasks:move-by-order": vi.fn().mockResolvedValue({}),
    })
    setActivePinia(createPinia())
  })

  afterEach(() => {
    board?.unmount()
    board = null
    document.body.innerHTML = ""
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  async function setupExternalDrop(kind) {
    const {useTasksStore} = await import("../../../src/renderer/src/stores/tasks/tasks.store")
    const {useMilestonesStore} = await import("../../../src/renderer/src/stores/milestones.store")
    const moveTaskByOrder = useTasksStore().moveTaskByOrder
    board = await mountBoardDrag([...makeColumn("in_progress", ["A", "B"]), ...makeColumn("done", ["X"])], {externalDrops: true})
    const {tasks, columns, chipOf, tracks, startDrag, hover, release, find} = board
    const milestones = useMilestonesStore()
    milestones.milestones.push({...milestones.milestones[0], id: "milestone-2", name: "Next"})
    tasks.moveTaskByOrder = moveTaskByOrder
    const zone = document.body.appendChild(document.createElement("div"))
    zone.setAttribute(kind === "day" ? "data-day-drop-zone" : "data-popup", "")
    const destination = zone.appendChild(document.createElement("div"))
    destination.setAttribute(kind === "day" ? "data-drop-day" : "data-drop-milestone", kind === "day" ? "2030-01-02" : "milestone-2")
    const chip = chipOf("done")
    document.elementFromPoint.mockImplementation((_, y) => (y === 20 ? destination : y === 30 ? chip : y === 40 ? null : tracks.in_progress))
    vi.useFakeTimers()

    return {columns, startDrag, hover, release, find, destination}
  }

  it.each([
    ["day", "chip", 30, "done"],
    ["milestone", "chip", 30, "done"],
    ["day", "outside", 40, "in_progress"],
    ["milestone", "outside", 40, "in_progress"],
  ])("discards the hovered %s destination when released on %s", async (kind, _, releaseY, status) => {
    const {columns, startDrag, hover, release, find, destination} = await setupExternalDrop(kind)

    startDrag(find("A"), yForIndex(0))
    await nextTick()
    hover(destination, 20)
    release(releaseY)
    if (status === "done") expect(columns.columnItems.value.done.at(-1).task.status).toBe("done")
    await vi.advanceTimersByTimeAsync(160)

    expect(find("A")).toMatchObject({status, milestoneId: "milestone-1", scheduled: {date: TODAY}})
    expect(bridge["tasks:update"]).not.toHaveBeenCalled()
    if (status === "done") {
      expect(bridge["tasks:move-by-order"]).toHaveBeenCalledExactlyOnceWith({
        taskId: "A",
        targetStatus: "done",
        boardMode: "normal",
        targetTaskId: null,
        position: "after",
        activeDate: TODAY,
        acrossProjects: false,
      })
    } else expect(bridge["tasks:move-by-order"]).not.toHaveBeenCalled()
  })

  it.each(["day", "milestone"])("accepts the release %s destination without a final pointer move and writes no status move", async (kind) => {
    const {startDrag, release, find} = await setupExternalDrop(kind)

    startDrag(find("A"), yForIndex(0))
    await nextTick()
    release(20)
    await vi.advanceTimersByTimeAsync(160)

    expect(find("A")).toMatchObject({
      status: "in_progress",
      milestoneId: kind === "milestone" ? "milestone-2" : "milestone-1",
      scheduled: {date: kind === "day" ? "2030-01-02" : TODAY},
    })
    expect(bridge["tasks:update"]).toHaveBeenCalledExactlyOnceWith(
      "A",
      kind === "day" ? {scheduled: {date: "2030-01-02"}} : {milestoneId: "milestone-2"},
    )
    expect(bridge["tasks:move-by-order"]).not.toHaveBeenCalled()
  })
})
