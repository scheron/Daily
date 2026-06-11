import {computed, reactive, ref, watch} from "vue"

import {removeDuplicates} from "@shared/utils/arrays/removeDuplicates"
import {deepClone} from "@shared/utils/common/deepClone"
import {sortTags} from "@shared/utils/tags/sortTags"
import {useTagsStore} from "@/stores/tags.store"
import {useTasksStore} from "@/stores/tasks.store"
import {useUIStore} from "@/stores/ui.store"
import {resolveMoveTarget, setDraggingTaskId, useTaskDragDrop} from "@/composables/useTaskDragDrop"

import {BOARD_COLUMNS, SORTABLE_ANIMATION_MS} from "./constants"

import type {MoveTaskByOrderParams, Tag, Task, TaskStatus} from "@shared/types/storage"

type UseBoardModelOptions = {
  tasks: () => Task[]
  dndDisabled: () => boolean
}

export function useBoardModel(options: UseBoardModelOptions) {
  const uiStore = useUIStore()
  const tasksStore = useTasksStore()
  const tagsStore = useTagsStore()

  const activeTagIdsByStatus = reactive<Record<TaskStatus, Tag["id"][]>>({active: [], discarded: [], done: []})
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
    dndDisabled: options.dndDisabled,
    onDragEnd: flushPendingCrossColumnMove,
  })

  const tasksByStatus = computed<Record<TaskStatus, Task[]>>(() => {
    return options.tasks().reduce(
      (acc, task) => {
        acc[task.status].push(task)
        return acc
      },
      {active: [], discarded: [], done: []} as Record<TaskStatus, Task[]>,
    )
  })

  const tagsByStatus = computed<Record<TaskStatus, Tag[]>>(() => {
    const rawTagsByStatus = tasksStore.dailyTasks.reduce(
      (acc, task) => {
        acc[task.status].push(...task.tags)
        return acc
      },
      {active: [], discarded: [], done: []} as Record<TaskStatus, Tag[]>,
    )

    return {
      active: sortTags(removeDuplicates(rawTagsByStatus.active, "name")),
      discarded: sortTags(removeDuplicates(rawTagsByStatus.discarded, "name")),
      done: sortTags(removeDuplicates(rawTagsByStatus.done, "name")),
    }
  })

  const visibleColumns = computed(() => BOARD_COLUMNS.filter((column) => !isColumnHidden(column.status)))

  const filteredTasksByStatus = computed<Record<TaskStatus, Task[]>>(() => {
    return {
      active: getFilteredTasksByStatus("active"),
      discarded: getFilteredTasksByStatus("discarded"),
      done: getFilteredTasksByStatus("done"),
    }
  })

  function onDragStart(event: {oldIndex: number; from: HTMLElement}) {
    const status = event.from.closest("[data-column-status]")?.getAttribute("data-column-status") as TaskStatus | null
    if (status) {
      const task = localTasksByStatus[status]?.[event.oldIndex]
      if (task) setDraggingTaskId(task.id)
    }
    onDragStartBase()
  }

  function isColumnCollapsed(status: TaskStatus) {
    if (uiStore.columnsAutoCollapseEmpty) return !isDragging.value && isColumnEmpty(status)
    return Boolean(uiStore.columnsCollapsed[status])
  }

  function onToggleColumn(status: TaskStatus) {
    if (uiStore.columnsAutoCollapseEmpty) return
    uiStore.toggleColumnCollapsed(status)
  }

  function onColumnDragEnter(status: TaskStatus) {
    if (uiStore.columnsAutoCollapseEmpty) return
    if (!isDragging.value) return
    if (!isColumnCollapsed(status)) return

    uiStore.setColumnCollapsed(status, false)
  }

  function getTaskTags(task: Task): Tag[] {
    const tags = task.tags.map((tag) => tagsStore.tagsMap.get(tag.id)).filter(Boolean) as Tag[]
    return sortTags(tags)
  }

  function getSelectedTagIdsSet(status: TaskStatus) {
    return new Set(activeTagIdsByStatus[status])
  }

  function onSelectTag(status: TaskStatus, id: Tag["id"]) {
    const selectedTagIds = activeTagIdsByStatus[status]
    if (selectedTagIds.includes(id)) {
      activeTagIdsByStatus[status] = selectedTagIds.filter((tagId) => tagId !== id)
      return
    }

    activeTagIdsByStatus[status] = [...selectedTagIds, id]
  }

  async function onColumnChange(status: TaskStatus, event: {added?: {newIndex: number}; moved?: {newIndex: number; oldIndex: number}}) {
    if (event.moved && event.moved.newIndex === event.moved.oldIndex) return
    if (!event.added && !event.moved) return

    const newIndex = event.added?.newIndex ?? event.moved?.newIndex
    if (newIndex === undefined) return

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
    localTasksByStatus.active = filteredTasksByStatus.value.active.map((task) => deepClone(task))
    localTasksByStatus.discarded = filteredTasksByStatus.value.discarded.map((task) => deepClone(task))
    localTasksByStatus.done = filteredTasksByStatus.value.done.map((task) => deepClone(task))
  }

  function isColumnEmpty(status: TaskStatus) {
    return tasksByStatus.value[status].length === 0
  }

  function isColumnHidden(status: TaskStatus) {
    if (!uiStore.columnsHideEmpty) return false
    return isColumnEmpty(status)
  }

  function getFilteredTasksByStatus(status: TaskStatus) {
    const selectedTagIds = activeTagIdsByStatus[status]
    if (!selectedTagIds.length) return tasksByStatus.value[status]

    const selectedTagIdsSet = new Set(selectedTagIds)
    return tasksByStatus.value[status].filter((task) => task.tags.some((tag) => selectedTagIdsSet.has(tag.id)))
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
        mode: "column",
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
    () => tasksStore.activeDay,
    () => {
      activeTagIdsByStatus.active = []
      activeTagIdsByStatus.discarded = []
      activeTagIdsByStatus.done = []
    },
  )

  watch(tagsByStatus, (newTagsByStatus) => {
    const statuses: TaskStatus[] = ["active", "done", "discarded"]
    statuses.forEach((status) => {
      const selected = activeTagIdsByStatus[status]
      if (!selected.length) return

      const availableIds = new Set(newTagsByStatus[status].map((tag) => tag.id))
      const pruned = selected.filter((id) => availableIds.has(id))
      if (pruned.length !== selected.length) activeTagIdsByStatus[status] = pruned
    })
  })

  watch(
    filteredTasksByStatus,
    () => {
      if (isDragging.value || isCommitting.value) return
      syncLocalTasks()
    },
    {immediate: true},
  )

  return {
    isDragging,
    isDragDisabled,
    localTasksByStatus,
    filteredTasksByStatus,
    tagsByStatus,
    visibleColumns,
    isColumnCollapsed,
    onToggleColumn,
    onColumnDragEnter,
    onDragStart,
    onDragEnd,
    onDragOver,
    onColumnChange,
    onSelectTag,
    getSelectedTagIdsSet,
    getTaskTags,
  }
}
