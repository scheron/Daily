import {watch} from "vue"
import {useEventListener} from "@vueuse/core"
import {storeToRefs} from "pinia"

import {useDragDropStore} from "@/stores/dragDrop.store"
import {useTaskEditorStore} from "@/stores/task-editor"
import {useUIStore} from "@/stores/ui"

export function useDockVisibility() {
  const uiStore = useUIStore()
  const dragDropStore = useDragDropStore()
  const taskEditorStore = useTaskEditorStore()

  const {isCalendarDockExpanded, shouldOpenCalendarDockOnDrag} = storeToRefs(uiStore)
  const {draggingTaskId} = storeToRefs(dragDropStore)
  const {isOpen: isEditorOpen} = storeToRefs(taskEditorStore)

  let wasExpandedBeforeDrag = false

  useEventListener(
    window,
    "keydown",
    (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return
      if (!isCalendarDockExpanded.value) return
      uiStore.toggleCalendarDock(false)
      event.preventDefault()
    },
    {capture: true},
  )

  watch(
    draggingTaskId,
    (taskId) => {
      if (taskId) {
        wasExpandedBeforeDrag = isCalendarDockExpanded.value
        if (shouldOpenCalendarDockOnDrag.value) uiStore.toggleCalendarDock(true)
        return
      }

      uiStore.toggleCalendarDock(wasExpandedBeforeDrag)
    },
    {flush: "sync"},
  )

  watch(isEditorOpen, (isOpen) => {
    if (isOpen) uiStore.toggleCalendarDock(false)
  })
}
