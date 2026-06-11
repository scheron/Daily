import {onBeforeUnmount, onMounted, watch} from "vue"

import {CHUNK_WIDTH, dateAtViewportCenter, scrollLeftForDate} from "./lattice"

import type {ISODate} from "@shared/types/common"
import type {Ref} from "vue"

const EDGE_THRESHOLD_PX = CHUNK_WIDTH * 1.5

export function useCalendarScroll(params: {
  scrollEl: Ref<HTMLElement | null>
  firstChunkIndex: Ref<number | null>
  onFocusDateChange: (date: ISODate) => void
  onReachEdge: (direction: "past" | "future") => void
}) {
  const {scrollEl, firstChunkIndex} = params
  let rafId: number | null = null

  function scrollToDate(date: ISODate, behavior: ScrollBehavior = "smooth") {
    const el = scrollEl.value
    if (!el || firstChunkIndex.value === null) return

    const left = scrollLeftForDate({date, firstChunkIndex: firstChunkIndex.value, clientWidth: el.clientWidth})
    if (typeof el.scrollTo === "function") el.scrollTo({left, behavior})
    else el.scrollLeft = left
  }

  function onScroll() {
    if (rafId !== null) return

    rafId = requestAnimationFrame(() => {
      rafId = null
      const el = scrollEl.value
      if (!el || firstChunkIndex.value === null) return

      params.onFocusDateChange(dateAtViewportCenter({scrollLeft: el.scrollLeft, clientWidth: el.clientWidth, firstChunkIndex: firstChunkIndex.value}))

      if (el.scrollLeft < EDGE_THRESHOLD_PX) {
        params.onReachEdge("past")
      } else if (el.scrollWidth - el.scrollLeft - el.clientWidth < EDGE_THRESHOLD_PX) {
        params.onReachEdge("future")
      }
    })
  }

  // Chunk-index changes in either direction are compensated so the same dates
  // stay under the viewport: prepends shift content right (scrollLeft grows),
  // replacements or future-side recenters shift it left (scrollLeft shrinks).
  // The browser clamps negative results to 0.
  watch(
    firstChunkIndex,
    (next, prev) => {
      const el = scrollEl.value
      if (!el || next === null || prev === null || prev === undefined) return
      if (next !== prev) el.scrollLeft += (prev - next) * CHUNK_WIDTH
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
