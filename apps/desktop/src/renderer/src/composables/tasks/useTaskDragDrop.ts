import {onBeforeUnmount, ref} from "vue"

import {useDragDropStore} from "@/stores/dragDrop.store"
import {findVerticalScrollAncestor} from "@/utils/ui/findVerticalScrollAncestor"
import {useDragAutoScroll} from "./useDragAutoScroll"

export function useTaskDragDrop() {
  const dragDropStore = useDragDropStore()

  const isDragging = ref(false)
  const isCommitting = ref(false)

  const autoScroll = useDragAutoScroll()

  function onDragStart() {
    isDragging.value = true
    window.addEventListener("dragover", onDragOver)
  }

  function onDragEnd() {
    isDragging.value = false
    dragDropStore.setDraggingTaskId(null)
    window.removeEventListener("dragover", onDragOver)
    autoScroll.stop()
  }

  function onDragOver(event: DragEvent) {
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
    window.removeEventListener("dragover", onDragOver)
    autoScroll.stop()
  })

  return {
    isDragging,
    isCommitting,
    onDragStart,
    onDragEnd,
    onDragOver,
    runWithCommit,
  }
}
