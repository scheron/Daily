import {computed, ref, useTemplateRef} from "vue"
import {tryOnMounted, useElementSize} from "@vueuse/core"

import {useUIStore} from "@/stores/ui.store"

export const SIDEBAR_WIDTH = 288

const FOOTER_HEIGHT = 40
const HEADER_HEIGHT = 62

export function useContentSize(contentId: string) {
  const uiStore = useUIStore()
  const headerHeight = ref(HEADER_HEIGHT)

  const containerRef = useTemplateRef<HTMLDivElement>(contentId)
  const {height, width} = useElementSize(containerRef)

  const sidebarWidth = computed(() => (uiStore.sidebarCollapsed ? 0 : SIDEBAR_WIDTH))
  const footerHeight = FOOTER_HEIGHT
  const contentHeight = computed(() => height.value - headerHeight.value - footerHeight)
  const contentWidth = computed(() => width.value - sidebarWidth.value)

  tryOnMounted(() => {
    headerHeight.value = parseInt(getComputedStyle(document.documentElement).getPropertyValue("--header-height"))
  })

  return {contentHeight, contentWidth, headerHeight, footerHeight, sidebarWidth}
}
