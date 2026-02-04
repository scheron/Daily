import {ref} from "vue"
import {defineStore} from "pinia"

import {useDevice} from "@/composables/useDevice"
import {useSettingValue} from "@/composables/useSettingsValue"

export const useUIStore = defineStore("ui", () => {
  const isSidebarCollapsed = useSettingValue("sidebar.collapsed", false)
  const {isDesktop} = useDevice()

  const isMobileSidebarOpen = ref(false)

  function toggleSidebarCollapse(isOpen?: boolean) {
    if (isDesktop.value) {
      isSidebarCollapsed.value = !isSidebarCollapsed.value
    } else {
      isMobileSidebarOpen.value = isOpen ?? !isMobileSidebarOpen.value
    }
  }

  return {
    isSidebarCollapsed,
    isMobileSidebarOpen,

    toggleSidebarCollapse,
  }
})
