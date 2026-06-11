import {computed, ref, useTemplateRef} from "vue"
import {tryOnMounted, useElementSize} from "@vueuse/core"

import {useUIStore} from "@/stores/ui.store"

export const FOOTER_HEIGHT = 40
export const FOOTER_EXPANDED_HEIGHT = 260

const HEADER_HEIGHT = 62

export function useContentSize(contentId: string) {
  const uiStore = useUIStore()
  const headerHeight = ref(HEADER_HEIGHT)

  const containerRef = useTemplateRef<HTMLDivElement>(contentId)
  const {height, width} = useElementSize(containerRef)

  const footerHeight = computed(() => (uiStore.calendarExpanded ? FOOTER_EXPANDED_HEIGHT : FOOTER_HEIGHT))
  const contentHeight = computed(() => height.value - headerHeight.value - footerHeight.value)
  const contentWidth = computed(() => width.value)

  tryOnMounted(() => {
    headerHeight.value = parseInt(getComputedStyle(document.documentElement).getPropertyValue("--header-height"))
  })

  return {contentHeight, contentWidth, headerHeight, footerHeight}
}
