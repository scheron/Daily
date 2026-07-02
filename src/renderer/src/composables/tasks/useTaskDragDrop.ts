import {computed, onBeforeUnmount, ref, toValue} from "vue"

import {useDragDropStore} from "@/stores/dragDrop.store"
import {useDragAutoScroll} from "@/composables/useDragAutoScroll"
import {findVerticalScrollAncestor} from "@/utils/ui/findVerticalScrollAncestor"

type TaskDragDropOptions = {
  dndDisabled?: boolean | (() => boolean)
  onDragEnd?: () => void
}

export function useTaskDragDrop(options: TaskDragDropOptions) {
  const dragDropStore = useDragDropStore()

  const isDragging = ref(false)
  const isCommitting = ref(false)
  const autoScroll = useDragAutoScroll()

  const isDragDisabled = computed(() => Boolean(toValue(options.dndDisabled ?? false)) || isCommitting.value)

  function onDragStart() {
    isDragging.value = true
    window.addEventListener("dragover", onGlobalDragOver)
  }

  function onDragEnd() {
    isDragging.value = false
    dragDropStore.setDraggingTaskId(null)
    window.removeEventListener("dragover", onGlobalDragOver)
    autoScroll.stop()
    options.onDragEnd?.()
  }

  function onDragOver(event: DragEvent) {
    if (!isDragging.value) return
    autoScroll.update(findVerticalScrollAncestor(event.target), event.clientY)
  }

  function onGlobalDragOver(event: DragEvent) {
    if (!isDragging.value) return
    autoScroll.update(findVerticalScrollAncestor(event.target), event.clientY)
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
