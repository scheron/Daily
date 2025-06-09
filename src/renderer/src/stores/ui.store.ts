import {ref} from "vue"
import {useElectronStore} from "@/composables/useElectronStore"
import {defineStore} from "pinia"

export const useUIStore = defineStore("ui", () => {
  const isCalendarOpen = ref(false)
  const isInfoPanelOpen = ref(false)
  const isExportTaskOpen = ref(false)
  const isSidebarCollapsed = useElectronStore("sidebarCollapsed", false)

  function setIsCalendarOpen(isOpen: boolean) {
    isCalendarOpen.value = isOpen
  }

  function toggleIsInfoPanelOpen(isOpen?: boolean) {
    isInfoPanelOpen.value = isOpen ?? !isInfoPanelOpen.value
  }

  function toggleSidebarCollapse() {
    isSidebarCollapsed.value = !isSidebarCollapsed.value
  }

  function toggleIsExportTaskOpen(isOpen?: boolean) {
    isExportTaskOpen.value = isOpen ?? !isExportTaskOpen.value
  }

  return {
    isCalendarOpen,
    isInfoPanelOpen,
    isExportTaskOpen,
    isSidebarCollapsed,
    setIsCalendarOpen,
    toggleIsInfoPanelOpen,
    toggleIsExportTaskOpen,
    toggleSidebarCollapse,
  }
})
