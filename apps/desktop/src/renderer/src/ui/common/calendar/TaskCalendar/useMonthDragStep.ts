import {onBeforeUnmount, watch} from "vue"
import {useEventListener} from "@vueuse/core"
import {storeToRefs} from "pinia"

import {useDragDropStore} from "@/stores/dragDrop.store"
import {findClosestAtPoint} from "@/utils/ui/dom"

import type {DateTime} from "luxon"
import type {Ref} from "vue"

const STEP_INTERVAL_MS = 400

/**
 * Pages the calendar month while a task is held over a month arrow. A drag never produces a click,
 * so the arrows are unreachable mid-drag without this. The first step waits out the interval, which
 * keeps a pointer passing over an arrow on its way to a day from changing the month.
 * @param currentMonth the month the calendar renders, stepped in place
 */
export function useMonthDragStep(currentMonth: Ref<DateTime<boolean>>) {
  const dragDropStore = useDragDropStore()

  const {draggingTaskId} = storeToRefs(dragDropStore)

  let stepTimer: ReturnType<typeof setInterval> | null = null
  let stepDirection: number | null = null

  useEventListener(window, "pointermove", onPointerMove)

  function onPointerMove(event: PointerEvent) {
    if (!draggingTaskId.value) return

    const step = findClosestAtPoint(event.clientX, event.clientY, "[data-month-step]")?.dataset.monthStep
    if (step === "previous") startStepping(-1)
    else if (step === "next") startStepping(1)
    else stopStepping()
  }

  function startStepping(direction: number) {
    if (direction === stepDirection) return

    stopStepping()
    stepDirection = direction
    stepTimer = setInterval(() => {
      currentMonth.value = currentMonth.value.plus({months: direction})
    }, STEP_INTERVAL_MS)
  }

  function stopStepping() {
    if (stepTimer) clearInterval(stepTimer)
    stepTimer = null
    stepDirection = null
  }

  watch(draggingTaskId, (taskId) => {
    if (!taskId) stopStepping()
  })

  onBeforeUnmount(stopStepping)
}
