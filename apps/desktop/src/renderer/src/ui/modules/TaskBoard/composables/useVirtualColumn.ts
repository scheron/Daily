import {computed, shallowRef, toValue, watch} from "vue"
import {useEventListener} from "@vueuse/core"

import {useBatchedResizeObserver} from "@/composables/useBatchedResizeObserver"
import {useBoardCardGeometry} from "@/composables/useBoardCardGeometry"

import type {ComputedRef, MaybeRefOrGetter, ShallowRef} from "vue"

type ColumnRange = {start: number; end: number}

/** A column renders only the rows this range covers, using the current shared card dimensions. */
export function useVirtualColumn(
  listRef: Readonly<ShallowRef<HTMLElement | null>>,
  trackRef: Readonly<ShallowRef<HTMLElement | null>>,
  count: MaybeRefOrGetter<number>,
): {range: ComputedRef<ColumnRange>; trackHeight: ComputedRef<number>} {
  const scrollTop = shallowRef(0)
  const viewportHeight = shallowRef(0)
  const trackTop = shallowRef(0)
  const {fontSize, cardHeight, cardStep} = useBoardCardGeometry()

  const range = computed<ColumnRange>((previous) => {
    const top = scrollTop.value - trackTop.value
    const start = Math.min(Math.max(0, toValue(count) - 1), Math.max(0, Math.floor(top / cardStep.value) - 3))
    const end = Math.min(toValue(count), Math.ceil((top + viewportHeight.value) / cardStep.value) + 3)

    return previous?.start === start && previous.end === end ? previous : {start, end}
  })

  const trackHeight = computed(() => {
    const total = toValue(count)
    return total > 0 ? total * cardStep.value - (cardStep.value - cardHeight.value) : 0
  })

  useEventListener(listRef, "scroll", onScroll, {passive: true})
  useBatchedResizeObserver([listRef], {read: readViewport, write: applyViewport})
  watch(
    [cardStep, fontSize],
    () => {
      applyViewport(readViewport())
      onScroll()
    },
    {flush: "post"},
  )

  function onScroll() {
    scrollTop.value = listRef.value?.scrollTop ?? 0
  }

  function readViewport() {
    return {viewportHeight: listRef.value?.clientHeight ?? 0, trackTop: trackRef.value?.offsetTop ?? 0}
  }

  function applyViewport(viewport: ReturnType<typeof readViewport>) {
    viewportHeight.value = viewport.viewportHeight
    trackTop.value = viewport.trackTop
  }

  return {range, trackHeight}
}
