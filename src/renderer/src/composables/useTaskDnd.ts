import {computed, inject, provide, ref, toValue} from "vue"

import type {Task, TaskStatus} from "@shared/types/storage"
import type {InjectionKey, MaybeRefOrGetter} from "vue"
import type {TaskDropMode, TaskDropPosition, TaskMoveMeta} from "@/utils/tasks/reorderTasks"

type TaskDropContext = {
  mode: TaskDropMode
  status?: TaskStatus
}

type UseTaskDndOptions = {
  tasks: MaybeRefOrGetter<Task[]>
  disabled?: MaybeRefOrGetter<boolean>
  onMove: (params: {
    taskId: Task["id"]
    mode: TaskDropMode
    targetTaskId?: Task["id"] | null
    targetStatus?: TaskStatus
    position?: TaskDropPosition
  }) => Promise<TaskMoveMeta | null>
  onMoved?: (meta: TaskMoveMeta) => void
}

const TASK_DND_KEY: InjectionKey<ReturnType<typeof useTaskDnd>> = Symbol("TASK_DND_KEY")

export function useTaskDnd(options: UseTaskDndOptions) {
  const draggingTaskId = ref<Task["id"] | null>(null)
  const dropTarget = ref<{
    taskId: Task["id"] | null
    mode: TaskDropMode
    status?: TaskStatus
    position: TaskDropPosition
  } | null>(null)
  const isMoving = ref(false)

  const isDragging = computed(() => draggingTaskId.value !== null)
  const canDrag = computed(() => !toValue(options.disabled) && !isMoving.value)

  function onDragStart(taskId: Task["id"], event: DragEvent) {
    if (!canDrag.value) return

    draggingTaskId.value = taskId
    dropTarget.value = null

    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = "move"
      event.dataTransfer.dropEffect = "move"
      event.dataTransfer.setData("text/plain", taskId)
    }
  }

  function onDragEnd() {
    draggingTaskId.value = null
    dropTarget.value = null
  }

  function onCardDragOver(event: DragEvent, targetTaskId: Task["id"], context: TaskDropContext) {
    if (!draggingTaskId.value || !canDrag.value) return

    event.preventDefault()
    setDropEffect(event)

    const bounds = (event.currentTarget as HTMLElement | null)?.getBoundingClientRect()
    const position = bounds && event.clientY > bounds.top + bounds.height / 2 ? "after" : "before"

    dropTarget.value = {
      taskId: targetTaskId,
      mode: context.mode,
      status: context.status,
      position,
    }
  }

  function onContainerDragOver(event: DragEvent, context: TaskDropContext) {
    if (!draggingTaskId.value || !canDrag.value) return

    event.preventDefault()
    setDropEffect(event)

    dropTarget.value = {
      taskId: null,
      mode: context.mode,
      status: context.status,
      position: "after",
    }
  }

  async function onCardDrop(event: DragEvent, targetTaskId: Task["id"], context: TaskDropContext) {
    event.preventDefault()
    await drop({
      mode: context.mode,
      status: context.status,
      targetTaskId,
      position: dropTarget.value?.taskId === targetTaskId ? dropTarget.value.position : "before",
    })
  }

  async function onContainerDrop(event: DragEvent, context: TaskDropContext) {
    event.preventDefault()
    await drop({
      mode: context.mode,
      status: context.status,
      targetTaskId: null,
      position: "after",
    })
  }

  function isTaskDragging(taskId: Task["id"]) {
    return draggingTaskId.value === taskId
  }

  function isCardDropTarget(taskId: Task["id"], context: TaskDropContext, position: TaskDropPosition) {
    if (!dropTarget.value) return false
    return (
      dropTarget.value.taskId === taskId &&
      dropTarget.value.mode === context.mode &&
      dropTarget.value.status === context.status &&
      dropTarget.value.position === position
    )
  }

  function isContainerDropTarget(context: TaskDropContext) {
    if (!dropTarget.value) return false
    return dropTarget.value.taskId === null && dropTarget.value.mode === context.mode && dropTarget.value.status === context.status
  }

  async function drop(params: {mode: TaskDropMode; status?: TaskStatus; targetTaskId: Task["id"] | null; position: TaskDropPosition}) {
    if (!draggingTaskId.value || isMoving.value || !canDrag.value) {
      onDragEnd()
      return
    }

    isMoving.value = true
    const taskId = draggingTaskId.value

    try {
      const sourceTask = toValue(options.tasks).find((task) => task.id === taskId)
      if (!sourceTask) return

      const moveMeta = await options.onMove({
        taskId,
        mode: params.mode,
        targetTaskId: params.targetTaskId,
        targetStatus: params.status ?? sourceTask.status,
        position: params.position,
      })

      if (moveMeta) {
        options.onMoved?.(moveMeta)
      }
    } finally {
      isMoving.value = false
      onDragEnd()
    }
  }

  return {
    isDragging,
    isMoving,
    draggingTaskId,

    onDragStart,
    onDragEnd,
    onCardDragOver,
    onContainerDragOver,
    onCardDrop,
    onContainerDrop,

    isTaskDragging,
    isCardDropTarget,
    isContainerDropTarget,
  }
}

export function provideTaskDnd(value: ReturnType<typeof useTaskDnd>) {
  provide(TASK_DND_KEY, value)
}

export function useInjectedTaskDnd() {
  const value = inject(TASK_DND_KEY, null)
  if (!value) {
    throw new Error("Task DnD context is not provided")
  }
  return value
}

function setDropEffect(event: DragEvent) {
  if (!event.dataTransfer) return
  event.dataTransfer.dropEffect = "move"
}
