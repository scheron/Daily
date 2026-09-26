// @ts-nocheck
import {defineComponent, h, nextTick} from "vue"
import {DateTime} from "luxon"
import {vi} from "vitest"

import {mount} from "@vue/test-utils"

export const TODAY = DateTime.now().toISODate()
export const TRACK_TOP = 100

export function makeTask(id, overrides = {}) {
  return {
    id,
    branchId: "main",
    milestoneId: "milestone-1",
    status: "active",
    content: id,
    minimized: false,
    orderIndex: 1024,
    scheduled: {date: TODAY, time: "09:00", timezone: "UTC"},
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

export function makeColumn(status, ids, overrides = {}) {
  return ids.map((id, index) => makeTask(id, {status, orderIndex: (index + 1) * 1024, ...overrides}))
}

export function yForIndex(index) {
  return TRACK_TOP + index * 206 + 50
}

export async function mountBoardDrag(seed, {frame = "day"} = {}) {
  const {useTasksStore} = await import("../../src/renderer/src/stores/tasks/tasks.store")
  const {useDragDropStore} = await import("../../src/renderer/src/stores/dragDrop.store")
  const {useSettingsStore} = await import("../../src/renderer/src/stores/settings.store")
  const {useFilterStore} = await import("../../src/renderer/src/stores/filter.store")
  const {useMilestonesStore} = await import("../../src/renderer/src/stores/milestones.store")
  const {useUIStore} = await import("../../src/renderer/src/stores/ui/ui.store")
  const {useTaskColumns} = await import("../../src/renderer/src/composables/tasks/useTaskColumns")

  let hit = null

  useSettingsStore().settings = {branch: {activeId: "main"}, layout: {sectionsCollapsed: {}}}
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

  const tasks = useTasksStore()
  tasks.activeDay = TODAY
  tasks.tasks = seed
  tasks.moveTaskByOrder = vi.fn().mockResolvedValue({})

  if (frame === "milestone") useFilterStore().setFrame("milestone")

  let columns = null
  const host = mount(
    defineComponent({
      setup() {
        columns = useTaskColumns()
        return () => h("div")
      },
    }),
  )
  await nextTick()

  const boardEl = document.body.appendChild(document.createElement("div"))
  boardEl.setAttribute("data-task-board", "")

  const board = {}
  for (const status of ["backlog", "active", "done", "discarded"]) {
    const column = document.createElement("div")
    column.dataset.columnStatus = status
    const list = document.createElement("div")
    list.setAttribute("data-column-list", "")
    const track = document.createElement("div")
    track.setAttribute("data-column-track", "")
    vi.spyOn(track, "getBoundingClientRect").mockReturnValue({
      top: TRACK_TOP,
      bottom: TRACK_TOP + 700,
      left: 0,
      right: 370,
      width: 370,
      height: 700,
    })
    list.append(track)
    column.append(list)
    boardEl.append(column)
    board[status] = track
  }

  const outside = document.createElement("div")
  document.body.append(outside)

  vi.spyOn(document, "elementFromPoint").mockImplementation(() => hit)

  function cardOf(task) {
    const card = document.createElement("div")
    card.setAttribute("data-task-card", "")
    card.addEventListener("pointerdown", (event) => columns.onCardPointerDown(event, task))
    board[task.status].append(card)
    return card
  }

  function pressOn(element, y, button = 0) {
    hit = element.closest("[data-column-track]")
    element.dispatchEvent(new PointerEvent("pointerdown", {bubbles: true, button, clientX: 50, clientY: y, pointerId: 1}))
  }

  function press(task, y, button = 0) {
    pressOn(cardOf(task), y, button)
  }

  function hover(element, y) {
    hit = element
    window.dispatchEvent(new PointerEvent("pointermove", {bubbles: true, clientX: 50, clientY: y, pointerId: 1}))
  }

  function moveOver(status, y) {
    hover(status ? board[status] : outside, y)
  }

  function startDrag(task, y) {
    press(task, y)
    moveOver(task.status, y + 10)
  }

  function release(y) {
    window.dispatchEvent(new PointerEvent("pointerup", {bubbles: true, clientX: 50, clientY: y, pointerId: 1}))
  }

  function find(id) {
    return tasks.tasks.find((task) => task.id === id)
  }

  return {
    tasks,
    drag: useDragDropStore(),
    ui: useUIStore(),
    columns,
    boardEl,
    tracks: board,
    cardOf,
    pressOn,
    press,
    hover,
    startDrag,
    moveOver,
    release,
    find,
    unmount: () => host.unmount(),
  }
}
