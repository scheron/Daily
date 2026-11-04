import {computed} from "vue"
import {useLocalStorage} from "@vueuse/core"

import {clamp} from "@daily/std"

export function usePanelSize() {
  const minSize = 320
  const maxSize = 640
  const rawSize = useLocalStorage<number>("daily.rightPanel.width", 420)

  const size = computed(() => clamp(rawSize.value, minSize, maxSize))

  function setSize(px: number) {
    rawSize.value = clamp(px, minSize, maxSize)
  }

  return {size, setSize}
}
