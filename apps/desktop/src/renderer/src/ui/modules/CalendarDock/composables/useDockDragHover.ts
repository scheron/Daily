import {watch} from "vue"
import {useEventListener} from "@vueuse/core"
import {storeToRefs} from "pinia"

import {useDragDropStore} from "@/stores/dragDrop.store"
import {useUIStore} from "@/stores/ui/ui.store"
import {findClosestAtPoint} from "@/utils/ui/dom"

import type {DockTab} from "./useDockTabs"

type HoverTarget = DockTab | "expand"

export function useDockDragHover() {
  const uiStore = useUIStore()
  const dragDropStore = useDragDropStore()

  const {isCalendarDockExpanded, calendarDockTab} = storeToRefs(uiStore)
  const {draggingTaskId} = storeToRefs(dragDropStore)

  let hoverTimer: ReturnType<typeof setTimeout> | null = null
  let hoverTarget: HoverTarget | null = null

  useEventListener(window, "pointermove", onPointerMove)

  watch(draggingTaskId, (taskId) => {
    if (!taskId) cancelHover()
  })

  function onPointerMove(event: PointerEvent) {
    if (!draggingTaskId.value) return

    if (!isCalendarDockExpanded.value) {
      startHover(findClosestAtPoint(event.clientX, event.clientY, "[data-dock-pill]") ? "expand" : null)
      return
    }

    const tab = findClosestAtPoint(event.clientX, event.clientY, "[data-tab]")?.dataset.tab as DockTab | undefined

    startHover(tab && tab !== calendarDockTab.value ? tab : null)
  }

  function startHover(target: HoverTarget | null) {
    if (target === hoverTarget) return

    cancelHover()
    if (!target) return

    hoverTarget = target
    hoverTimer = setTimeout(() => {
      if (target === "expand") uiStore.toggleCalendarDock(true)
      else uiStore.setCalendarDockTab(target)
      hoverTarget = null
      hoverTimer = null
    }, 250)
  }

  function cancelHover() {
    if (hoverTimer) clearTimeout(hoverTimer)
    hoverTimer = null
    hoverTarget = null
  }
}
