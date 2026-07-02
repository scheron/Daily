import {computed, reactive, ref, watch} from "vue"

import {deepClone} from "@shared/utils/common/deepClone"
import {isUndefined} from "@shared/utils/common/validators"
import {useDragDropStore} from "@/stores/dragDrop.store"
import {useFilterStore} from "@/stores/filter.store"
import {useTasksStore} from "@/stores/tasks"
import {useUIStore} from "@/stores/ui"
import {createSharedComposable} from "@/composables/createSharedComposable"
import {useTaskDragDrop} from "@/composables/tasks/useTaskDragDrop"
import {TASK_COLUMNS} from "@/constants/ui"
import {resolveMoveTarget} from "@/utils/tasks/resolveMoveTarget"

import type {TaskColumn} from "@/types/ui"
import type {MoveTaskByOrderParams, Task, TaskStatus} from "@shared/types/storage"

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

  const tasksByStatus = computed<Record<TaskStatus, Task[]>>(() => {
    return filteredTasks.value.reduce(
      (acc, task) => {
        acc[task.status].push(task)
        return acc
      },
      {active: [], discarded: [], done: []} as Record<TaskStatus, Task[]>,
    )
  })

  const localTasksByStatus = reactive<Record<TaskStatus, Task[]>>({active: [], discarded: [], done: []})

  const pendingCrossColumnMove = ref<MoveTaskByOrderParams | null>(null)

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

  const visibleColumns = computed<TaskColumn[]>(() => TASK_COLUMNS.filter((s) => !isColumnHidden(s.status)))

  function onDragStart(event: {oldIndex: number; from: HTMLElement}) {
    const status = event.from.closest("[data-column-status]")?.getAttribute("data-column-status") as TaskStatus | null
    if (status) {
      const task = localTasksByStatus[status]?.[event.oldIndex]
      if (task) dragDropStore.setDraggingTaskId(task.id)
    }
    onDragStartBase()
  }

  function isColumnCollapsed(status: TaskStatus) {
    if (uiStore.sectionsAutoCollapseEmpty) return !isDragging.value && isColumnEmpty(status)
    return Boolean(uiStore.sectionsCollapsed[status])
  }

  function onToggleColumn(status: TaskStatus) {
    if (uiStore.sectionsAutoCollapseEmpty) return
    uiStore.toggleSectionCollapsed(status)
  }

  function onColumnDragEnter(status: TaskStatus) {
    if (uiStore.sectionsAutoCollapseEmpty) return
    if (!isDragging.value) return
    if (!isColumnCollapsed(status)) return

    uiStore.setSectionCollapsed(status, false)
  }

  async function onColumnChange(status: TaskStatus, event: {added?: {newIndex: number}; moved?: {newIndex: number; oldIndex: number}}) {
    if (event.moved && event.moved.newIndex === event.moved.oldIndex) return
    if (!event.added && !event.moved) return

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
    } as MoveTaskByOrderParams

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
  }

  function isColumnEmpty(status: TaskStatus) {
    return tasksByStatus.value[status].length === 0
  }

  function isColumnHidden(status: TaskStatus) {
    if (!uiStore.sectionsHideEmpty) return false
    return isColumnEmpty(status)
  }

  function flushPendingCrossColumnMove() {
    const pendingMove = pendingCrossColumnMove.value
    if (!pendingMove) return
    pendingCrossColumnMove.value = null

    setTimeout(() => commitColumnMove(pendingMove), SORTABLE_ANIMATION_MS)
  }

  async function commitColumnMove(params: MoveTaskByOrderParams) {
    await runWithCommit(async () => {
      const result = await tasksStore.moveTaskByOrder({
        taskId: params.taskId,
        targetStatus: params.targetStatus,
        targetTaskId: params.targetTaskId,
        position: params.position,
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
