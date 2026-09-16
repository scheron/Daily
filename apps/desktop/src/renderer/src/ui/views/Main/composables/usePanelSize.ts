import {computed, ref} from "vue"
import {useEventListener, useLocalStorage} from "@vueuse/core"

import {clamp} from "@daily/std"

export function usePanelSize() {
  const maxSize = ref(computeMaxSize())

  const rawSize = useLocalStorage<number>("daily.rightPanel.width", 420)

  const size = computed(() => clamp(rawSize.value, 320, maxSize.value))

  useEventListener(window, "resize", () => (maxSize.value = computeMaxSize()))

  function computeMaxSize(): number {
    return Math.min(640, window.innerWidth - 720)
  }

  function setSize(px: number) {
    rawSize.value = clamp(px, 320, maxSize.value)
  }

  return {size, setSize}
}
