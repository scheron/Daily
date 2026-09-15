import {watch} from "vue"
import {useEventListener} from "@vueuse/core"
import {storeToRefs} from "pinia"

import {useDragDropStore} from "@/stores/dragDrop.store"
import {useUIStore} from "@/stores/ui"
import {findClosestAtPoint} from "@/utils/ui/dom"

import type {CalendarDockTab} from "@/stores/ui"

type HoverTarget = CalendarDockTab | "expand" | "collapse"

export function useDockDragHover() {
  const uiStore = useUIStore()
  const dragDropStore = useDragDropStore()

  const {isCalendarDockExpanded, calendarDockTab} = storeToRefs(uiStore)
  const {draggingTaskId} = storeToRefs(dragDropStore)

  let hoverTimer: ReturnType<typeof setTimeout> | null = null
  let hoverTarget: HoverTarget | null = null
  let isExpandedByHover = false

  useEventListener(window, "pointermove", onPointerMove)

  function onPointerMove(event: PointerEvent) {
    if (!draggingTaskId.value) return

    if (!isCalendarDockExpanded.value) {
      startHover(findClosestAtPoint(event.clientX, event.clientY, "[data-dock-pill]") ? "expand" : null)
      return
    }

    if (isExpandedByHover && !findClosestAtPoint(event.clientX, event.clientY, "[data-day-drop-zone]")) {
      startHover("collapse")
      return
    }

    const tab = findClosestAtPoint(event.clientX, event.clientY, "[data-tab]")?.dataset.tab as CalendarDockTab | undefined

    startHover(tab && tab !== calendarDockTab.value ? tab : null)
  }

  function startHover(target: HoverTarget | null) {
    if (target === hoverTarget) return

    cancelHover()
    if (!target) return

    hoverTarget = target
    hoverTimer = setTimeout(() => {
      if (target === "expand") {
        isExpandedByHover = true
        uiStore.toggleCalendarDock(true)
      } else if (target === "collapse") {
        isExpandedByHover = false
        uiStore.toggleCalendarDock(false)
      } else {
        uiStore.setCalendarDockTab(target)
      }
      hoverTarget = null
      hoverTimer = null
    }, 250)
  }

  function cancelHover() {
    if (hoverTimer) clearTimeout(hoverTimer)
    hoverTimer = null
    hoverTarget = null
  }

  watch(draggingTaskId, (taskId) => {
    if (taskId) return
    cancelHover()
    isExpandedByHover = false
  })
}
