import {computed, onBeforeUnmount, ref, toValue} from "vue"

import {resolveVerticalScrollableAncestor, useDragAutoScroll} from "@/composables/useDragAutoScroll"

type TaskDragDropOptions = {
  dndDisabled: boolean | (() => boolean)
  onDragEnd?: () => void
}

type TaskLike<Id extends string | number = string | number> = {
  id: Id
}

export function useTaskDragDrop(options: TaskDragDropOptions) {
  const isDragging = ref(false)
  const isCommitting = ref(false)
  const autoScroll = useDragAutoScroll()

  const isDragDisabled = computed(() => toValue(options.dndDisabled) || isCommitting.value)

  function onDragStart() {
    isDragging.value = true
    window.addEventListener("dragover", onGlobalDragOver)
  }

  function onDragEnd() {
    isDragging.value = false
    window.removeEventListener("dragover", onGlobalDragOver)
    autoScroll.stop()
    options.onDragEnd?.()
  }

  function onDragOver(event: DragEvent) {
    if (!isDragging.value) return
    autoScroll.update(resolveVerticalScrollableAncestor(event.target), event.clientY)
  }

  function onGlobalDragOver(event: DragEvent) {
    if (!isDragging.value) return
    autoScroll.update(resolveVerticalScrollableAncestor(event.target), event.clientY)
  }

  async function runWithCommit<T>(run: () => Promise<T>): Promise<T> {
    isCommitting.value = true
    try {
      return await run()
    } finally {
      isCommitting.value = false
    }
  }

  onBeforeUnmount(() => {
    window.removeEventListener("dragover", onGlobalDragOver)
    autoScroll.stop()
  })

  return {
    isDragging,
    isCommitting,
    isDragDisabled,
    onDragStart,
    onDragEnd,
    onDragOver,
    runWithCommit,
  }
}

export function resolveMoveTarget<Id extends string | number, Item extends TaskLike<Id>>(items: Item[], newIndex: number) {
  const nextTask = items[newIndex + 1] ?? null
  const targetTaskId = (nextTask?.id ?? null) as string | null
  const position: "before" | "after" = targetTaskId ? "before" : "after"

  return {
    targetTaskId,
    position,
  }
}
