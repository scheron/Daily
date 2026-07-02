import {computed, ref} from "vue"
import {useEventListener, useLocalStorage} from "@vueuse/core"

import {clamp} from "@shared/utils/numbers/clamp"

type PanelSizeConfig = {
  defaultSize: number
  minSize: number
  maxSize: number
  viewportReserve?: number
}

/**
 * Reactive, persisted width for a side panel. Returns the clamped `size` plus controls;
 * @example const {size, setSize} = usePanelSize("left-panel-width", {defaultSize: 300, minSize: 280, maxSize: 460, viewportReserve: 520})
 */
export function usePanelSize(storageKey: string, config: PanelSizeConfig) {
  const {defaultSize, minSize, maxSize: maxCap, viewportReserve = 0} = config

  const maxSize = ref(computeMaxSize())

  const rawSize = useLocalStorage<number>(storageKey, defaultSize)
  const size = computed(() => clamp(rawSize.value, minSize, maxSize.value))

  function setSize(px: number) {
    rawSize.value = clamp(px, minSize, maxSize.value)
  }

  function reset() {
    rawSize.value = defaultSize
  }

  function computeMaxSize(): number {
    return Math.min(maxCap, window.innerWidth - viewportReserve)
  }

  useEventListener(window, "resize", () => (maxSize.value = computeMaxSize()))

  return {size, maxSize, setSize, reset}
}
