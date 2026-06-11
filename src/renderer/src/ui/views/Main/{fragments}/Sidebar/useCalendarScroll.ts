import {onBeforeUnmount, onMounted, watch} from "vue"

import type {ISODate} from "@shared/types/common"
import type {Ref} from "vue"

// ~1.5–2 typical month sections; extendRange adds 3 months (~700px+), so one
// extension always clears the threshold after compensation.
const EDGE_THRESHOLD_PX = 480

export function useCalendarScroll(params: {
  scrollEl: Ref<HTMLElement | null>
  firstMonthKey: Ref<string | null>
  onReachEdge: (direction: "past" | "future") => void
}) {
  const {scrollEl, firstMonthKey} = params
  let rafId: number | null = null
  let heightBeforePatch: number | null = null

  function scrollToDate(date: ISODate, behavior: ScrollBehavior = "smooth") {
    const el = scrollEl.value
    // clientHeight 0 = layout not settled yet; the viewport-size watch in the
    // component retries later. A missing cell means the date isn't rendered yet;
    // the queued-scroll mechanism re-issues once the range loads.
    if (!el || el.clientHeight === 0) return

    const cell = el.querySelector<HTMLElement>(`[data-drop-day="${date}"]`)
    if (cell && typeof cell.scrollIntoView === "function") {
      cell.scrollIntoView({block: "center", behavior})
    }
  }

  function onScroll() {
    if (rafId !== null) return

    rafId = requestAnimationFrame(() => {
      rafId = null
      const el = scrollEl.value
      if (!el) return

      if (el.scrollTop < EDGE_THRESHOLD_PX) {
        params.onReachEdge("past")
      } else if (el.scrollHeight - el.scrollTop - el.clientHeight < EDGE_THRESHOLD_PX) {
        params.onReachEdge("future")
      }
    })
  }

  // When the first rendered month changes (prepend or range replacement), the
  // content above the viewport shifts. Capture the height before the DOM patch
  // (pre-flush) and shift scrollTop by the delta after it (post-flush, before
  // paint) so the same dates stay under the viewport.
  watch(firstMonthKey, (next, prev) => {
    const el = scrollEl.value
    if (!el || !next || !prev || next === prev) return
    heightBeforePatch = el.scrollHeight
  })

  watch(
    firstMonthKey,
    () => {
      const el = scrollEl.value
      if (!el || heightBeforePatch === null) return
      el.scrollTop += el.scrollHeight - heightBeforePatch
      heightBeforePatch = null
    },
    {flush: "post"},
  )

  onMounted(() => {
    scrollEl.value?.addEventListener("scroll", onScroll, {passive: true})
  })

  onBeforeUnmount(() => {
    scrollEl.value?.removeEventListener("scroll", onScroll)
    if (rafId !== null) cancelAnimationFrame(rafId)
  })

  return {scrollToDate}
}
