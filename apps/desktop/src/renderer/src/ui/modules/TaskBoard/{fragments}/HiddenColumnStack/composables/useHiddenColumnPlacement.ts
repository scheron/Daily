import {computed, shallowRef, toValue, watch} from "vue"
import {useEventListener, useRafFn, useResizeObserver} from "@vueuse/core"

import type {CSSProperties, MaybeRefOrGetter} from "vue"

export function useHiddenColumnPlacement(stackRef: MaybeRefOrGetter<HTMLElement | null>, obstacle: MaybeRefOrGetter<HTMLElement | null | undefined>) {
  const placementStyle = shallowRef<CSSProperties>({})
  const isObscured = shallowRef(false)

  const placementResizeTargets = computed(() => [toValue(stackRef), toValue(stackRef)?.parentElement, toValue(obstacle)])

  const {resume: schedulePlacementUpdate} = useRafFn(updatePlacement, {immediate: false, once: true})

  useEventListener(window, "resize", schedulePlacementUpdate)
  useResizeObserver(placementResizeTargets, schedulePlacementUpdate)

  function updatePlacement() {
    placementStyle.value = {}
    isObscured.value = false
    const stack = toValue(stackRef)
    const container = stack?.parentElement
    const element = toValue(obstacle)
    if (!stack || !container || !element) return
    const bounds = container.getBoundingClientRect()
    const rect = element.getBoundingClientRect()
    const stackRect = stack.getBoundingClientRect()
    if (rect.width <= 0 || rect.right <= bounds.left || rect.left >= bounds.right || rect.top >= stackRect.bottom) return
    const edge = rect.left - 16
    isObscured.value = edge - stackRect.width < bounds.left + 16
    placementStyle.value = {right: `${bounds.right - edge}px`, ...(isObscured.value && {visibility: "hidden"})}
  }

  watch(placementResizeTargets, schedulePlacementUpdate, {flush: "post", immediate: true})

  return {placementStyle, isObscured}
}
