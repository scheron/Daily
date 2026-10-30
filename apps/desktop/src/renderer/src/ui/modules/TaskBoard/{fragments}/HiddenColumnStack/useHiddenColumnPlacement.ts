import {computed, shallowRef, watch} from "vue"
import {useEventListener, useRafFn, useResizeObserver} from "@vueuse/core"

import type {CSSProperties, Ref, ShallowRef} from "vue"

export function useHiddenColumnPlacement(
  stackRef: Readonly<ShallowRef<HTMLElement | null>>,
  obstacle: Readonly<Ref<HTMLElement | null | undefined>>,
) {
  const placementStyle = shallowRef<CSSProperties>({})
  const isObscured = shallowRef(false)

  const placementResizeTargets = computed(() => [stackRef.value, stackRef.value?.parentElement, obstacle.value])

  const {resume: schedulePlacementUpdate} = useRafFn(updatePlacement, {immediate: false, once: true})

  useEventListener(window, "resize", schedulePlacementUpdate)
  useResizeObserver(placementResizeTargets, schedulePlacementUpdate)

  function updatePlacement() {
    placementStyle.value = {}
    isObscured.value = false
    const stack = stackRef.value
    const container = stack?.parentElement
    const element = obstacle.value
    if (!stack || !container || !element) return
    const bounds = container.getBoundingClientRect()
    const rect = element.getBoundingClientRect()
    if (rect.width <= 0 || rect.right <= bounds.left || rect.left >= bounds.right) return
    const edge = rect.left - 16
    isObscured.value = edge - stack.getBoundingClientRect().width < bounds.left + 16
    placementStyle.value = {right: `${bounds.right - edge}px`, visibility: isObscured.value ? "hidden" : undefined}
  }

  watch(placementResizeTargets, schedulePlacementUpdate, {flush: "post", immediate: true})

  return {placementStyle, isObscured}
}
