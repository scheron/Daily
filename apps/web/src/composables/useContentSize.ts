import {computed, ref, useTemplateRef} from "vue"
import {tryOnMounted, useElementSize} from "@vueuse/core"
import {useUIStore} from "@/stores/ui.store"

export const useContentSize = (contentId: string) => {
  const uiStore = useUIStore()

  const headerHeight = ref(62)
  const sidebarWidth = ref(280)
  const sidebarCollapsedWidth = ref(80)

  const containerRef = useTemplateRef<HTMLDivElement>(contentId)
  const {height, width} = useElementSize(containerRef)

  const contentHeight = computed(() => height.value - headerHeight.value)
  const contentWidth = computed(() => width.value - (uiStore.isSidebarCollapsed ? sidebarCollapsedWidth.value : sidebarWidth.value))

  tryOnMounted(() => {
    headerHeight.value = parseInt(getComputedStyle(document.documentElement).getPropertyValue("--header-height"))
    sidebarWidth.value = parseInt(getComputedStyle(document.documentElement).getPropertyValue("--sidebar-width"))
    sidebarCollapsedWidth.value = parseInt(getComputedStyle(document.documentElement).getPropertyValue("--sidebar-collapsed-width"))
  })

  return {contentHeight, contentWidth, headerHeight, sidebarWidth}
}