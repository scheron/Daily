import {computed, ref, useTemplateRef} from "vue"
import {tryOnMounted, useElementSize} from "@vueuse/core"

import {useUIStore} from "@/stores/ui.store"
import {useDevice} from "@/composables/useDevice"

const HEADER_HEIGHT = 62
const SIDEBAR_WIDTH = 280
const FOOTER_HEIGHT = 40

export function useContentSize(contentId: string) {
  const uiStore = useUIStore()
  const {isDesktop} = useDevice()

  const headerHeight = ref(HEADER_HEIGHT)
  const sidebarWidth = ref(SIDEBAR_WIDTH)

  const footerHeight = computed(() => (!isDesktop.value || uiStore.isSidebarCollapsed ? FOOTER_HEIGHT : 0))

  const containerRef = useTemplateRef<HTMLDivElement>(contentId)
  const {height, width} = useElementSize(containerRef)

  const contentHeight = computed(() => height.value - headerHeight.value - footerHeight.value)
  const contentWidth = computed(() => {
    if (!isDesktop.value) return width.value
    if (uiStore.isSidebarCollapsed) return width.value
    return width.value - sidebarWidth.value
  })

  tryOnMounted(() => {
    headerHeight.value = parseInt(getComputedStyle(document.documentElement).getPropertyValue("--header-height"))
    sidebarWidth.value = parseInt(getComputedStyle(document.documentElement).getPropertyValue("--sidebar-width"))
  })

  return {contentHeight, contentWidth, headerHeight, sidebarWidth, footerHeight}
}
