import {computed, reactive, ref, watch} from "vue"

import {deepClone, isUndefined} from "@daily/std"

import {createSharedComposable} from "@/composables/createSharedComposable"
import {TASK_COLUMNS} from "@/constants/ui"
import {useDragDropStore} from "@/stores/dragDrop.store"
import {useFilterStore} from "@/stores/filter.store"
import {useTasksStore} from "@/stores/tasks"
import {useUIStore} from "@/stores/ui"
import {resolveMoveTarget} from "@/utils/tasks/resolveMoveTarget"
import {useTaskDragDrop} from "./useTaskDragDrop"

import type {TaskColumn} from "@/types/ui"
import type {MoveTaskByOrderParams, Task, TaskStatus} from "@daily/protocol"

const SORTABLE_ANIMATION_MS = 160

export const useTaskColumns = createSharedComposable(() => {
  const tasksStore = useTasksStore()
  const filterStore = useFilterStore()
  const uiStore = useUIStore()
  const dragDropStore = useDragDropStore()

  const filteredTasks = computed(() => {
    if (!filterStore.activeTagIds.size) return tasksStore.dailyTasks
    return tasksStore.dailyTasks.filter((task) => task.tags.some((tag) => filterStore.activeTagIds.has(tag.id)))
  })

  const filteredBacklogTasks = computed(() => {
    if (!filterStore.activeTagIds.size) return tasksStore.backlogTasks
    return tasksStore.backlogTasks.filter((task) => task.tags.some((tag) => filterStore.activeTagIds.has(tag.id)))
  })

  const tasksByStatus = computed<Record<TaskStatus, Task[]>>(() => {
    const grouped = filteredTasks.value.reduce(
      (acc, task) => {
        acc[task.status].push(task)
        return acc
      },
      {backlog: [], active: [], discarded: [], done: []} as Record<TaskStatus, Task[]>,
    )
    grouped.backlog = filteredBacklogTasks.value
    return grouped
  })

  const localTasksByStatus = reactive<Record<TaskStatus, Task[]>>({backlog: [], active: [], discarded: [], done: []})

  const pendingCrossColumnMove = ref<MoveTaskByOrderParams | null>(null)
  const isSettling = ref(false)

  const {
    isDragging,
    isCommitting,
    isDragDisabled,
    onDragStart: onDragStartBase,
    onDragEnd,
    onDragOver,
    runWithCommit,
  } = useTaskDragDrop({
    onDragEnd: flushPendingCrossColumnMove,
  })

  const isBusy = computed(() => isDragging.value || isCommitting.value || isSettling.value)

  const visibleColumns = computed<TaskColumn[]>(() => TASK_COLUMNS.filter((s) => s.status !== "backlog" && !isColumnHidden(s.status)))

  function onDragStart(event: {item: HTMLElement}) {
    const taskId = event.item?.dataset?.taskId
    if (taskId) dragDropStore.setDraggingTaskId(taskId)
    onDragStartBase()
  }

  function isColumnCollapsed(status: TaskStatus) {
    if (status === "backlog") return false
    if (uiStore.sectionsAutoCollapseEmpty) return !isBusy.value && isColumnEmpty(status)
    return Boolean(uiStore.sectionsCollapsed[status])
  }

  function onToggleColumn(status: TaskStatus) {
    if (status === "backlog") return
    if (uiStore.sectionsAutoCollapseEmpty) return
    uiStore.toggleSectionCollapsed(status)
  }

  function onColumnDragEnter(status: TaskStatus) {
    if (status === "backlog") return
    if (uiStore.sectionsAutoCollapseEmpty) return
    if (!isDragging.value) return
    if (!isColumnCollapsed(status)) return

    uiStore.setSectionCollapsed(status, false)
  }

  async function onColumnChange(status: TaskStatus, event: {added?: {newIndex: number}; moved?: {newIndex: number; oldIndex: number}}) {
    if (event.moved && event.moved.newIndex === event.moved.oldIndex) return
    if (!event.added && !event.moved) return

    if (dragDropStore.dayDropHandled) {
      syncLocalTasks()
      return
    }

    const newIndex = event.added?.newIndex ?? event.moved?.newIndex
    if (isUndefined(newIndex)) return

    const movedTask = localTasksByStatus[status][newIndex]
    if (!movedTask) return

    movedTask.status = status

    const {targetTaskId, position} = resolveMoveTarget(localTasksByStatus[status], newIndex)

    const moveParams = {
      taskId: movedTask.id,
      targetStatus: status,
      targetTaskId,
      position,
      activeDay: tasksStore.activeDay,
    } as MoveTaskByOrderParams

    if (event.added) {
      pendingCrossColumnMove.value = moveParams
      isSettling.value = true
      return
    }

    await commitColumnMove(moveParams)
  }

  function syncLocalTasks() {
    localTasksByStatus.backlog = tasksByStatus.value.backlog.map((task) => deepClone(task))
    localTasksByStatus.active = tasksByStatus.value.active.map((task) => deepClone(task))
    localTasksByStatus.discarded = tasksByStatus.value.discarded.map((task) => deepClone(task))
    localTasksByStatus.done = tasksByStatus.value.done.map((task) => deepClone(task))
  }

  function isColumnEmpty(status: TaskStatus) {
    return localTasksByStatus[status].length === 0
  }

  function isColumnHidden(status: TaskStatus) {
    if (!uiStore.sectionsHideEmpty) return false
    return isColumnEmpty(status)
  }

  function flushPendingCrossColumnMove() {
    const pendingMove = pendingCrossColumnMove.value
    pendingCrossColumnMove.value = null

    if (!pendingMove || dragDropStore.dayDropHandled) {
      isSettling.value = false
      syncLocalTasks()
      return
    }

    setTimeout(async () => {
      try {
        await commitColumnMove(pendingMove)
      } finally {
        isSettling.value = false
      }
    }, SORTABLE_ANIMATION_MS)
  }

  async function commitColumnMove(params: MoveTaskByOrderParams) {
    await runWithCommit(async () => {
      await tasksStore.moveTaskByOrder({
        taskId: params.taskId,
        targetStatus: params.targetStatus,
        targetTaskId: params.targetTaskId,
        position: params.position,
        activeDay: params.activeDay,
      })

      syncLocalTasks()
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
    isBusy,
    isDragDisabled,
    isColumnCollapsed,
    onToggleColumn,
    onColumnDragEnter,
    onColumnChange,
    onDragStart,
    onDragEnd,
    onDragOver,
  }
})
