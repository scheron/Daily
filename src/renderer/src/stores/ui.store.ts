import {ref} from "vue"
import {useDevice} from "@/composables/useDevice"
import {useSettingsStore} from "@/composables/useSettingsStore"
import {defineStore} from "pinia"

export const useUIStore = defineStore("ui", () => {
  const isSidebarCollapsed = useSettingsStore("sidebar.collapsed", false)
  const {isDesktop} = useDevice()

  const isExportTaskOpen = ref(false)
  const isMobileSidebarOpen = ref(false)

  function toggleSidebarCollapse(isOpen?: boolean) {
    if (isDesktop.value) {
      isSidebarCollapsed.value = !isSidebarCollapsed.value
    } else {
      isMobileSidebarOpen.value = isOpen ?? !isMobileSidebarOpen.value
    }
  }

  function toggleIsExportTaskOpen(isOpen?: boolean) {
    isExportTaskOpen.value = isOpen ?? !isExportTaskOpen.value
  }

  return {
    isExportTaskOpen,
    isSidebarCollapsed,
    isMobileSidebarOpen,

    toggleSidebarCollapse,
    toggleIsExportTaskOpen,
  }
})
