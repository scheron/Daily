import {useEventListener} from "@vueuse/core"
import {storeToRefs} from "pinia"

import {useDragDropStore} from "@/stores/dragDrop.store"
import {useUIStore} from "@/stores/ui"

import type {ShallowRef} from "vue"

/**
 * Expands the dock once the pointer rests on it and collapses it again on the way out.
 * Stands aside while a card is being dragged — `useDockDragHover` owns the dock for the length of a drag.
 */
export function useDockHover(dock: Readonly<ShallowRef<HTMLElement | null>>) {
  const uiStore = useUIStore()
  const dragDropStore = useDragDropStore()

  const {draggingTaskId} = storeToRefs(dragDropStore)

  let hoverTimer: ReturnType<typeof setTimeout> | null = null

  useEventListener(dock, "pointerenter", () => startHover(true))
  useEventListener(dock, "pointerleave", () => startHover(false))

  function startHover(isExpanded: boolean) {
    cancelHover()
    if (draggingTaskId.value) return

    hoverTimer = setTimeout(() => {
      hoverTimer = null
      uiStore.toggleCalendarDock(isExpanded)
    }, 250)
  }

  function cancelHover() {
    if (hoverTimer) clearTimeout(hoverTimer)
    hoverTimer = null
  }
}
