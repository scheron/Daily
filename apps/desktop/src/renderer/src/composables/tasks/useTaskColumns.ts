import {computed, reactive, ref, watch} from "vue"
import {useEventListener} from "@vueuse/core"

import {sortTasksByDateThenOrder, sortTasksByOrderIndex} from "@daily/protocol"
import {deepClone, isUndefined} from "@daily/std"

import {createSharedComposable} from "@/composables/createSharedComposable"
import {TASK_COLUMNS} from "@/constants/ui"
import {useDragDropStore} from "@/stores/dragDrop.store"
import {useFilterStore} from "@/stores/filter.store"
import {useMilestonesStore} from "@/stores/milestones.store"
import {useTasksStore} from "@/stores/tasks"
import {useUIStore} from "@/stores/ui"
import {findClosestAtPoint} from "@/utils/ui/dom"
import {useTaskDragDrop} from "./useTaskDragDrop"

import type {TaskColumn} from "@/types/ui"
import type {MoveTaskByOrderParams, Task, TaskStatus} from "@daily/protocol"

export const useTaskColumns = createSharedComposable(() => {
  const tasksStore = useTasksStore()
  const filterStore = useFilterStore()
  const milestonesStore = useMilestonesStore()
  const uiStore = useUIStore()
  const dragDropStore = useDragDropStore()

  const localTasksByStatus = reactive<Record<TaskStatus, Task[]>>({active: [], discarded: [], done: [], backlog: []})
  const pendingCrossColumnMove = ref<MoveTaskByOrderParams | null>(null)
  const pendingLocalResync = ref(false)

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

  const visibleColumns = computed<TaskColumn[]>(() => TASK_COLUMNS.filter((s) => !isColumnHidden(s.status)))

  const {isDragging, isCommitting, onDragStart: onDragStartBase, onDragEnd: onDragEndBase, onDragOver, runWithCommit} = useTaskDragDrop()

  useEventListener(window, "pointermove", onDragPointerMove)

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

  function onDragStart(event: {oldIndex: number; from: HTMLElement}) {
    const status = event.from.closest("[data-column-status]")?.getAttribute("data-column-status") as TaskStatus | null
    if (status) {
      const task = localTasksByStatus[status]?.[event.oldIndex]
      if (task) dragDropStore.setDraggingTaskId(task.id)
    }
    onDragStartBase()
  }

  function onDragEnd() {
    onDragEndBase()
    flushPendingCrossColumnMove()
  }

  function isColumnCollapsed(status: TaskStatus) {
    if (uiStore.shouldCollapseEmptySections) return !isDragging.value && isColumnEmpty(status)
    return Boolean(uiStore.sectionsCollapsed[status])
  }

  function onToggleColumn(status: TaskStatus) {
    if (uiStore.shouldCollapseEmptySections) return
    uiStore.toggleSectionCollapsed(status)
  }

  function onDragPointerMove(event: PointerEvent) {
    if (!isDragging.value) return

    const status = findClosestAtPoint(event.clientX, event.clientY, "[data-column-status]")?.dataset.columnStatus as TaskStatus | undefined
    if (status) onColumnDragEnter(status)
  }

  function onColumnDragEnter(status: TaskStatus) {
    if (uiStore.shouldCollapseEmptySections) return
    if (!isDragging.value) return
    if (!isColumnCollapsed(status)) return

    uiStore.setSectionCollapsed(status, false)
  }

  async function onColumnChange(status: TaskStatus, event: {added?: {newIndex: number}; moved?: {newIndex: number; oldIndex: number}}) {
    if (dragDropStore.isReleasedInsideDropZone) return
    if (event.moved && event.moved.newIndex === event.moved.oldIndex) return
    if (!event.added && !event.moved) return

    const isMilestoneFrame = filterStore.frame === "milestone"

    if (isMilestoneFrame && event.moved) {
      pendingLocalResync.value = true
      return
    }

    const newIndex = event.added?.newIndex ?? event.moved?.newIndex
    if (isUndefined(newIndex)) return

    const movedTask = localTasksByStatus[status][newIndex]
    if (!movedTask) return

    movedTask.status = status

    const {targetTaskId, position} = isMilestoneFrame
      ? {targetTaskId: null, position: "after" as const}
      : resolveMoveTarget(localTasksByStatus[status], newIndex)

    const moveParams: MoveTaskByOrderParams = {
      taskId: movedTask.id,
      targetStatus: status,
      targetTaskId,
      position,
      activeDate: tasksStore.activeDay,
    }

    if (event.added) {
      pendingCrossColumnMove.value = moveParams
      return
    }

    await commitColumnMove(moveParams)
  }

  function syncLocalTasks() {
    localTasksByStatus.active = tasksByStatus.value.active.map((task) => deepClone(task))
    localTasksByStatus.discarded = tasksByStatus.value.discarded.map((task) => deepClone(task))
    localTasksByStatus.done = tasksByStatus.value.done.map((task) => deepClone(task))
    localTasksByStatus.backlog = tasksByStatus.value.backlog.map((task) => deepClone(task))
  }

  function isColumnEmpty(status: TaskStatus) {
    return tasksByStatus.value[status].length === 0
  }

  function isColumnHidden(status: TaskStatus) {
    if (!uiStore.shouldHideEmptySections) return false
    return isColumnEmpty(status)
  }

  function flushPendingCrossColumnMove() {
    if (dragDropStore.isReleasedInsideDropZone) {
      pendingCrossColumnMove.value = null
      pendingLocalResync.value = false
      syncLocalTasks()
      return
    }

    if (pendingLocalResync.value) {
      pendingLocalResync.value = false
      syncLocalTasks()
    }

    const pendingMove = pendingCrossColumnMove.value
    if (!pendingMove) return
    pendingCrossColumnMove.value = null

    setTimeout(() => commitColumnMove(pendingMove), 160)
  }

  async function commitColumnMove(params: MoveTaskByOrderParams) {
    await runWithCommit(async () => {
      const result = await tasksStore.moveTaskByOrder({
        taskId: params.taskId,
        targetStatus: params.targetStatus,
        targetTaskId: params.targetTaskId,
        position: params.position,
        activeDate: params.activeDate,
      })

      if (!result) {
        syncLocalTasks()
      }
    })
  }

  watch(
    tasksByStatus,
    () => {
      if (isDragging.value || isCommitting.value) return
      syncLocalTasks()
    },
    {immediate: true},
  )

  return {
    visibleColumns,
    tasksByStatus,
    localTasksByStatus,
    isDragging,
    isDragDisabled: isCommitting,
    isColumnCollapsed,
    onToggleColumn,
    onColumnChange,
    onDragStart,
    onDragEnd,
    onDragOver,
  }
})

function resolveMoveTarget(items: Task[], newIndex: number): {targetTaskId: Task["id"] | null; position: "before" | "after"} {
  const nextTask = items[newIndex + 1] ?? null
  const targetTaskId = nextTask?.id ?? null
  const position: "before" | "after" = targetTaskId ? "before" : "after"

  return {targetTaskId, position}
}
