import {computed, shallowRef, toValue} from "vue"
import {useEventListener} from "@vueuse/core"

import {useBatchedResizeObserver} from "@/composables/useBatchedResizeObserver"
import {BOARD_CARD_HEIGHT, BOARD_CARD_STEP} from "@/constants/ui"

import type {ComputedRef, MaybeRefOrGetter, ShallowRef} from "vue"

type ColumnRange = {start: number; end: number}

/** A column renders only the rows this range covers; it needs no measurement, because every card is `BOARD_CARD_HEIGHT` tall. */
export function useVirtualColumn(
  listRef: Readonly<ShallowRef<HTMLElement | null>>,
  trackRef: Readonly<ShallowRef<HTMLElement | null>>,
  count: MaybeRefOrGetter<number>,
): {range: ComputedRef<ColumnRange>; trackHeight: ComputedRef<number>} {
  const scrollTop = shallowRef(0)
  const viewportHeight = shallowRef(0)
  const trackTop = shallowRef(0)

  const range = computed<ColumnRange>((previous) => {
    const top = scrollTop.value - trackTop.value
    const start = Math.max(0, Math.floor(top / BOARD_CARD_STEP) - 3)
    const end = Math.min(toValue(count), Math.ceil((top + viewportHeight.value) / BOARD_CARD_STEP) + 3)

    return previous?.start === start && previous.end === end ? previous : {start, end}
  })

  const trackHeight = computed(() => {
    const total = toValue(count)
    return total > 0 ? total * BOARD_CARD_STEP - (BOARD_CARD_STEP - BOARD_CARD_HEIGHT) : 0
  })

  useEventListener(listRef, "scroll", onScroll, {passive: true})
  useBatchedResizeObserver([listRef], {read: readViewport, write: applyViewport})

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
