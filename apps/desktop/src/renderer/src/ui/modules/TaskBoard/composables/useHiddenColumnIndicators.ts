import {computed, onScopeDispose, shallowRef, toValue, watch} from "vue"
import {useEventListener, useRafFn, useResizeObserver} from "@vueuse/core"

import {clamp} from "@daily/std"

import {useTaskColumns} from "@/composables/tasks/useTaskColumns"

import type {TaskColumn} from "@/types/ui"
import type {TaskStatus} from "@daily/protocol"
import type {MaybeRefOrGetter} from "vue"
import type {HiddenColumn} from "../types"

export function useHiddenColumnIndicators(boardRef: MaybeRefOrGetter<HTMLElement | null>, visibleColumns: MaybeRefOrGetter<TaskColumn[]>) {
  let disposed = false
  let pendingNavigation: {status: TaskStatus; origin: Element | null} | null = null

  const hiddenColumns = shallowRef<{left: HiddenColumn[]; right: HiddenColumn[]}>({left: [], right: []})

  const columns = useTaskColumns()

  const indicatorColumns = computed<HiddenColumn[]>(() =>
    toValue(visibleColumns).map((column) => ({
      ...column,
      count: columns.tasksByStatus.value[column.status].length,
    })),
  )
  const collapsedColumns = computed(() => toValue(visibleColumns).map((column) => columns.isColumnCollapsed(column.status)))
  const indicatorResizeTargets = computed(() => {
    const board = toValue(boardRef)
    return [board, ...indicatorColumns.value.map((column) => board?.querySelector<HTMLElement>(`[data-column-status="${column.status}"]`))]
  })

  const {pause, resume} = useRafFn(sampleIndicatorGeometry, {immediate: false, once: true})

  useEventListener(boardRef, "scroll", scheduleIndicatorUpdate, {passive: true})
  useEventListener(boardRef, "scrollend", finishNavigation)
  useEventListener(window, "resize", scheduleIndicatorUpdate)
  useResizeObserver(indicatorResizeTargets, scheduleIndicatorUpdate)

  function revealColumn(status: TaskStatus) {
    const board = toValue(boardRef)
    const column = board?.querySelector<HTMLElement>(`[data-column-status="${status}"]`)
    if (!board || !column) return
    const viewport = board.getBoundingClientRect()
    const rect = column.getBoundingClientRect()
    let left = board.scrollLeft
    if (rect.left < viewport.left) left += rect.left - viewport.left
    else if (rect.right > viewport.right) left += Math.min(rect.right - viewport.right, rect.left - viewport.left)
    pendingNavigation = {status, origin: document.activeElement}
    board.scrollTo({left: clamp(left, 0, Math.max(0, board.scrollWidth - board.clientWidth)), behavior: "smooth"})
    scheduleIndicatorUpdate()
  }

  function scheduleIndicatorUpdate() {
    queueMicrotask(() => {
      if (!disposed && toValue(boardRef)) resume()
    })
  }

  function sampleIndicatorGeometry() {
    updateIndicators()
    const elements = toValue(boardRef)?.querySelectorAll<HTMLElement>("[data-column-status]") ?? []
    const isAnimating = Array.from(elements).some((column) => {
      const animations = column.getAnimations?.() ?? []
      return animations.some((animation) => animation.playState === "running" || animation.pending)
    })
    if (isAnimating) scheduleIndicatorUpdate()
  }

  function updateIndicators() {
    const board = toValue(boardRef)
    if (!board) {
      hiddenColumns.value = {left: [], right: []}
      pendingNavigation = null
      return
    }
    const viewport = board.getBoundingClientRect()
    const hidden: typeof hiddenColumns.value = {left: [], right: []}
    if (viewport.width > 0) {
      for (const column of indicatorColumns.value) {
        if (!column.count) continue
        const element = board.querySelector<HTMLElement>(`[data-column-status="${column.status}"]`)
        if (!element) continue
        const rect = element.getBoundingClientRect()
        const midpoint = rect.left + rect.width / 2
        if (midpoint <= viewport.left) hidden.left.push(column)
        else if (midpoint >= viewport.right) hidden.right.push(column)
      }
    }
    hiddenColumns.value = hidden
    if (!pendingNavigation) return
    const {status, origin} = pendingNavigation
    const target = indicatorColumns.value.find((column) => column.status === status && column.count > 0)
    if (!target) {
      pendingNavigation = null
      return
    }
    if ([...hidden.left, ...hidden.right].some((column) => column.status === status)) return
    pendingNavigation = null
    if (document.activeElement !== origin && document.activeElement !== document.body) return
    board.querySelector<HTMLElement>(`[data-column-status="${status}"] [data-column-drag-handle]`)?.focus({preventScroll: true})
  }

  function finishNavigation() {
    updateIndicators()
    pendingNavigation = null
  }

  function refreshIndicatorGeometry() {
    if (toValue(boardRef)) {
      scheduleIndicatorUpdate()
      return
    }
    pause()
    pendingNavigation = null
    hiddenColumns.value = {left: [], right: []}
  }

  watch([() => toValue(boardRef), indicatorColumns, collapsedColumns], refreshIndicatorGeometry, {flush: "post", immediate: true})

  onScopeDispose(() => {
    disposed = true
    pendingNavigation = null
  })

  return {hiddenColumns, revealColumn}
}
