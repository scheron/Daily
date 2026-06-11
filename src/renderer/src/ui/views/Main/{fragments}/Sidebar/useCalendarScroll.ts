import {onBeforeUnmount, onMounted, watch} from "vue"

import {dateAtViewportCenter, ROW_HEIGHT, scrollTopForDate} from "./weekLattice"

import type {ISODate} from "@shared/types/common"
import type {Ref} from "vue"

// ~2 months of rows; extendRange adds ~13 rows (3 months), so one extension
// always clears the threshold after compensation.
const EDGE_THRESHOLD_PX = ROW_HEIGHT * 8

export function useCalendarScroll(params: {
  scrollEl: Ref<HTMLElement | null>
  firstWeekIndex: Ref<number | null>
  onFocusDateChange: (date: ISODate) => void
  onReachEdge: (direction: "past" | "future") => void
}) {
  const {scrollEl, firstWeekIndex} = params
  let rafId: number | null = null

  function scrollToDate(date: ISODate, behavior: ScrollBehavior = "smooth") {
    const el = scrollEl.value
    // clientHeight 0 = layout not settled yet; centering math would clamp to an
    // arbitrary edge. The viewport-size watch in the component retries later.
    if (!el || el.clientHeight === 0 || firstWeekIndex.value === null) return

    const top = scrollTopForDate({date, firstWeekIndex: firstWeekIndex.value, clientHeight: el.clientHeight})
    if (typeof el.scrollTo === "function") el.scrollTo({top, behavior})
    else el.scrollTop = top
  }

  /** Recompute the focus date and edge state from the current scroll position (e.g. after a resize). */
  function refresh() {
    onScroll()
  }

  function onScroll() {
    if (rafId !== null) return

    rafId = requestAnimationFrame(() => {
      rafId = null
      const el = scrollEl.value
      if (!el || firstWeekIndex.value === null) return

      params.onFocusDateChange(dateAtViewportCenter({scrollTop: el.scrollTop, clientHeight: el.clientHeight, firstWeekIndex: firstWeekIndex.value}))

      if (el.scrollTop < EDGE_THRESHOLD_PX) {
        params.onReachEdge("past")
      } else if (el.scrollHeight - el.scrollTop - el.clientHeight < EDGE_THRESHOLD_PX) {
        params.onReachEdge("future")
      }
    })
  }

  // Week-index changes in either direction are compensated (flush: "post" = after
  // the DOM patch, before paint) so the same dates stay under the viewport.
  watch(
    firstWeekIndex,
    (next, prev) => {
      const el = scrollEl.value
      if (!el || next === null || prev === null || prev === undefined) return
      if (next !== prev) el.scrollTop += (prev - next) * ROW_HEIGHT
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

  return {scrollToDate, refresh}
}
