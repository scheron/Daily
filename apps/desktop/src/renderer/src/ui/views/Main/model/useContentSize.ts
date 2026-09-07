import {computed, ref, useTemplateRef} from "vue"
import {tryOnMounted, useElementSize} from "@vueuse/core"

import {getCssVariable} from "@/utils/ui/dom"

const HEADER_HEIGHT = parseFloat(getCssVariable("--header-height") || "44")

export function useContentSize(contentId: string) {
  const headerHeight = ref(HEADER_HEIGHT)

  const containerRef = useTemplateRef<HTMLDivElement>(contentId)
  const {height, width} = useElementSize(containerRef)

  const contentHeight = computed(() => height.value - headerHeight.value)
  const contentWidth = computed(() => width.value)

  tryOnMounted(() => {
    headerHeight.value = parseFloat(getCssVariable("--header-height"))
  })

  return {contentHeight, contentWidth, headerHeight}
}
