import {computed, nextTick, onScopeDispose, shallowRef, watch} from "vue"
import {useEventListener} from "@vueuse/core"

import {sortTasksByDateThenOrder, sortTasksByOrderIndex} from "@daily/protocol"
import {clamp} from "@daily/std"

import {createSharedComposable} from "@/composables/createSharedComposable"
import {BOARD_CARD_HEIGHT, BOARD_CARD_STEP} from "@/constants/ui"
import {useDragDropStore} from "@/stores/dragDrop.store"
import {useFilterStore} from "@/stores/filter.store"
import {useMilestonesStore} from "@/stores/milestones.store"
import {useTasksStore} from "@/stores/tasks"
import {useUIStore} from "@/stores/ui"
import {findClosestAtPoint} from "@/utils/ui/dom"
import {useDragAutoScroll} from "./useDragAutoScroll"
import {useTaskDragDrop} from "./useTaskDragDrop"

import type {MoveTaskByOrderParams, Task, TaskStatus} from "@daily/protocol"

/** One row a board column renders: a task's card, or the gap the dragged card would drop into. */
export type ColumnItem = {kind: "task"; task: Task} | {kind: "placeholder"}

type ColumnSlot = {status: TaskStatus; index: number}
type PlacedTask = ColumnSlot & {task: Task}
type CardPress = {task: Task; pointerId: number; x: number; y: number}

export const useTaskColumns = createSharedComposable(() => {
  const tasksStore = useTasksStore()
  const filterStore = useFilterStore()
  const milestonesStore = useMilestonesStore()
  const uiStore = useUIStore()
  const dragDropStore = useDragDropStore()

  const dropTarget = shallowRef<ColumnSlot | null>(null)
  const landing = shallowRef<PlacedTask | null>(null)

  let hoverExpandedStatus: TaskStatus | null = null
  let press: CardPress | null = null
  let origin: PlacedTask | null = null
  let pointer = {x: 0, y: 0}
  let bodyUserSelect = ""

  const milestoneFrameTasks = computed(() => {
    const ids = filterStore.activeMilestoneId ? [filterStore.activeMilestoneId] : milestonesStore.activeMilestones.map((milestone) => milestone.id)
    return ids.flatMap((id) => tasksStore.tasksByMilestoneId.get(id) ?? [])
  })

  const filteredTasks = computed(() => filterByTag(tasksStore.dailyTasks))
  const filteredBacklogTasks = computed(() => filterByTag(tasksStore.backlogTasks))
  const filteredMilestoneTasks = computed(() => filterByTag(milestoneFrameTasks.value))

  const tasksByStatus = computed<Record<TaskStatus, Task[]>>(() => {
    if (filterStore.frame === "milestone") {
      const framed = groupByStatus(filteredMilestoneTasks.value)

      return {
        active: sortTasksByDateThenOrder(framed.active),
        discarded: sortTasksByDateThenOrder(framed.discarded),
        done: sortTasksByDateThenOrder(framed.done),
        backlog: sortTasksByOrderIndex(framed.backlog),
      }
    }

    const grouped = groupByStatus(filteredTasks.value)
    grouped.backlog = filteredBacklogTasks.value
    return grouped
  })

  const columnItems = computed<Record<TaskStatus, ColumnItem[]>>(() => ({
    backlog: toColumnItems("backlog"),
    active: toColumnItems("active"),
    done: toColumnItems("done"),
    discarded: toColumnItems("discarded"),
  }))

  const {isDragging, isCommitting, onDragStart, onDragEnd, runWithCommit} = useTaskDragDrop()
  const columnScroll = useDragAutoScroll("y")
  const boardScroll = useDragAutoScroll("x")

  useEventListener(window, "pointermove", onDragPointerMove)

  /** Starts watching a press on a board card; it becomes a drag once the pointer travels more than 2 px, and every drop is decided from the pointer and the column grid. */
  function onCardPointerDown(event: PointerEvent, task: Task) {
    if (press || event.button !== 0 || isCommitting.value) return

    const ignored = (event.target as Element | null)?.closest("[data-draggable-task-ignore], button, a, input, textarea, select, [role='button']")
    if (ignored && (event.currentTarget as Element | null)?.contains(ignored)) return

    press = {task, pointerId: event.pointerId, x: event.clientX, y: event.clientY}
    window.addEventListener("pointermove", onPressPointerMove)
    window.addEventListener("pointerup", onPressPointerUp)
    window.addEventListener("pointercancel", onPressPointerCancel)
    window.addEventListener("keydown", onPressKeyDown)
  }

  /** Unfolds the task's column and scrolls the card to its middle, resolving once the card is mounted; `false` when the task is not on the board. */
  async function revealTask(taskId: Task["id"]): Promise<boolean> {
    const byStatus = tasksByStatus.value
    const status = (Object.keys(byStatus) as TaskStatus[]).find((key) => byStatus[key].some((task) => task.id === taskId))
    if (!status) return false

    const index = byStatus[status].findIndex((task) => task.id === taskId)
    if (isColumnCollapsed(status)) uiStore.setSectionCollapsed(status, false)
    await nextTick()

    const column = document.querySelector<HTMLElement>(`[data-column-status="${status}"]`)
    const list = column?.querySelector<HTMLElement>("[data-column-list]")
    const track = list?.querySelector<HTMLElement>("[data-column-track]")
    if (!column || !list || !track) return false

    column.scrollIntoView({behavior: "instant", block: "nearest", inline: "nearest"})

    const top = clamp(
      track.offsetTop + index * BOARD_CARD_STEP + BOARD_CARD_HEIGHT / 2 - list.clientHeight / 2,
      0,
      list.scrollHeight - list.clientHeight,
    )
    if (Math.abs(top - list.scrollTop) >= 1) {
      await new Promise<void>((resolve) => {
        const timeout = setTimeout(resolve, 1000)
        list.addEventListener(
          "scrollend",
          () => {
            clearTimeout(timeout)
            resolve()
          },
          {once: true},
        )
        list.scrollTo({top, behavior: "smooth"})
      })
    }

    await new Promise((resolve) => requestAnimationFrame(resolve))
    await nextTick()
    return Boolean(document.getElementById(taskId))
  }

  function isColumnCollapsed(status: TaskStatus) {
    return Boolean(uiStore.sectionsCollapsed[status])
  }

  function onToggleColumn(status: TaskStatus) {
    uiStore.toggleSectionCollapsed(status)
  }

  function filterByTag(tasks: Task[]) {
    if (!filterStore.activeTagIds.size) return tasks
    return tasks.filter((task) => task.tags.some((tag) => filterStore.activeTagIds.has(tag.id)))
  }

  function groupByStatus(tasks: Task[]): Record<TaskStatus, Task[]> {
    return tasks.reduce(
      (acc, task) => {
        acc[task.status].push(task)
        return acc
      },
      {active: [], discarded: [], done: [], backlog: []} as Record<TaskStatus, Task[]>,
    )
  }

  function onDragPointerMove(event: PointerEvent) {
    if (!isDragging.value) return

    const status = findClosestAtPoint(event.clientX, event.clientY, "[data-column-status]")?.dataset.columnStatus as TaskStatus | undefined
    if (status === hoverExpandedStatus) return

    collapseHoverExpanded()
    if (!status || !isColumnCollapsed(status)) return

    hoverExpandedStatus = status
    uiStore.setSectionCollapsed(status, false)
  }

  function collapseHoverExpanded() {
    if (!hoverExpandedStatus) return

    uiStore.setSectionCollapsed(hoverExpandedStatus, true)
    hoverExpandedStatus = null
  }

  function toColumnItems(status: TaskStatus): ColumnItem[] {
    const hiddenIds = [dragDropStore.draggingTaskId, landing.value?.task.id]
    const items: ColumnItem[] = tasksByStatus.value[status].filter((task) => !hiddenIds.includes(task.id)).map((task) => ({kind: "task", task}))

    if (landing.value?.status === status) items.splice(clamp(landing.value.index, 0, items.length), 0, {kind: "task", task: landing.value.task})
    else if (dropTarget.value?.status === status) items.splice(clamp(dropTarget.value.index, 0, items.length), 0, {kind: "placeholder"})

    return items
  }

  function onPressPointerMove(event: PointerEvent) {
    if (!press || event.pointerId !== press.pointerId) return
    if (!origin) {
      if (Math.abs(event.clientX - press.x) <= 2 && Math.abs(event.clientY - press.y) <= 2) return
      startDrag(press.task)
    }

    event.preventDefault()
    pointer = {x: event.clientX, y: event.clientY}
    trackPointer()
  }

  function onPressPointerUp(event: PointerEvent) {
    if (!press || event.pointerId !== press.pointerId) return

    const dragged = origin
    const target = dropTarget.value
    if (dragged && target && !dragDropStore.isReleasedInsideDropZone) dropCard(dragged, target)

    stopPress()
    if (dragged) swallowNextClick()
  }

  function onPressPointerCancel(event: PointerEvent) {
    if (press && event.pointerId === press.pointerId) stopPress()
  }

  function onPressKeyDown(event: KeyboardEvent) {
    if (event.key === "Escape") stopPress()
  }

  function startDrag(task: Task) {
    origin = {task, status: task.status, index: tasksByStatus.value[task.status].findIndex((item) => item.id === task.id)}
    dragDropStore.setDraggingTaskId(task.id)
    onDragStart()

    bodyUserSelect = document.body.style.userSelect
    document.body.style.userSelect = "none"
    dropTarget.value = {status: origin.status, index: origin.index}
    window.addEventListener("scroll", trackPointer, {capture: true, passive: true})
  }

  function trackPointer() {
    const hit = document.elementFromPoint(pointer.x, pointer.y)
    const board = hit?.closest<HTMLElement>("[data-task-board]")
    const column = hit?.closest<HTMLElement>("[data-column-status]")
    const status = column?.dataset.columnStatus as TaskStatus | undefined
    const track = column?.querySelector<HTMLElement>("[data-column-track]")

    if (board) boardScroll.update(board, pointer.x)
    else boardScroll.stop()

    if (!column || !status || !track || isColumnCollapsed(status)) {
      dropTarget.value = null
      columnScroll.stop()
      return
    }

    const count = tasksByStatus.value[status].filter((task) => task.id !== origin?.task.id).length
    const index = getColumnInsertIndex(pointer.y - track.getBoundingClientRect().top, count)
    if (dropTarget.value?.status !== status || dropTarget.value.index !== index) dropTarget.value = {status, index}

    columnScroll.update(column.querySelector<HTMLElement>("[data-column-list]"), pointer.y)
  }

  function dropCard(dragged: PlacedTask, target: ColumnSlot) {
    const isMilestoneFrame = filterStore.frame === "milestone"
    const isSameColumn = target.status === dragged.status
    if (isSameColumn && (isMilestoneFrame || target.index === dragged.index)) return

    const column = tasksByStatus.value[target.status].filter((task) => task.id !== dragged.task.id)
    column.splice(target.index, 0, dragged.task)

    const params: MoveTaskByOrderParams = {
      taskId: dragged.task.id,
      targetStatus: target.status,
      ...(isMilestoneFrame ? {targetTaskId: null, position: "after" as const} : resolveMoveTarget(column, target.index)),
      activeDate: tasksStore.activeDay,
    }

    landing.value = {...target, task: {...dragged.task, status: target.status}}
    if (isSameColumn) writeMove(params)
    else setTimeout(() => writeMove(params), 160)
  }

  async function writeMove(params: MoveTaskByOrderParams) {
    try {
      await runWithCommit(() => tasksStore.moveTaskByOrder(params))
    } finally {
      landing.value = null
    }
  }

  function stopPress() {
    press = null
    window.removeEventListener("pointermove", onPressPointerMove)
    window.removeEventListener("pointerup", onPressPointerUp)
    window.removeEventListener("pointercancel", onPressPointerCancel)
    window.removeEventListener("keydown", onPressKeyDown)
    if (!origin) return

    origin = null
    dropTarget.value = null
    columnScroll.stop()
    boardScroll.stop()
    document.body.style.userSelect = bodyUserSelect
    window.removeEventListener("scroll", trackPointer, {capture: true})
    hoverExpandedStatus = null
    onDragEnd()
  }

  function swallowNextClick() {
    window.addEventListener("click", swallowClick, {capture: true, once: true})
    setTimeout(() => window.removeEventListener("click", swallowClick, {capture: true}))
  }

  function swallowClick(event: MouseEvent) {
    event.stopPropagation()
    event.preventDefault()
  }

  watch(tasksByStatus, (byStatus) => {
    const draggedId = origin?.task.id
    if (!draggedId || dragDropStore.isReleasedInsideDropZone) return
    if (!Object.values(byStatus).some((tasks) => tasks.some((task) => task.id === draggedId))) stopPress()
  })

  onScopeDispose(() => {
    stopPress()
    window.removeEventListener("click", swallowClick, {capture: true})
  })

  return {
    tasksByStatus,
    columnItems,
    isDragging,
    isDragDisabled: isCommitting,
    isColumnCollapsed,
    onToggleColumn,
    onCardPointerDown,
    revealTask,
  }
})

function resolveMoveTarget(items: Task[], newIndex: number): {targetTaskId: Task["id"] | null; position: "before" | "after"} {
  const nextTask = items[newIndex + 1] ?? null
  const targetTaskId = nextTask?.id ?? null
  const position: "before" | "after" = targetTaskId ? "before" : "after"

  return {targetTaskId, position}
}

function getColumnInsertIndex(offsetY: number, count: number): number {
  return clamp(Math.floor(offsetY / BOARD_CARD_STEP), 0, count)
}
