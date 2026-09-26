import {ref} from "vue"

import {useDragDropStore} from "@/stores/dragDrop.store"

export function useTaskDragDrop() {
  const dragDropStore = useDragDropStore()

  const isDragging = ref(false)
  const isCommitting = ref(false)

  function onDragStart() {
    isDragging.value = true
  }

  function onDragEnd() {
    isDragging.value = false
    dragDropStore.setDraggingTaskId(null)
  }

  async function runWithCommit<T>(run: () => Promise<T>): Promise<T> {
    isCommitting.value = true
    try {
      return await run()
    } finally {
      isCommitting.value = false
    }
  }

  return {
    isDragging,
    isCommitting,
    onDragStart,
    onDragEnd,
    runWithCommit,
  }
}
