import {computed, ref} from "vue"
import {defineStore} from "pinia"

import {useDevice} from "@/composables/useDevice"
import {useSettingValue} from "@/composables/useSettingsValue"

import type {TaskStatus} from "@shared/types/storage"

export type TasksViewMode = "list" | "columns"
type ColumnsCollapsed = Record<TaskStatus, boolean>

export const useUIStore = defineStore("ui", () => {
  const isSidebarCollapsed = useSettingValue("sidebar.collapsed", false)
  const tasksViewMode = useSettingValue("layout.type", "list" as TasksViewMode)
  const columnsHideEmpty = useSettingValue("layout.columnsHideEmpty", false)
  const activeColumnCollapsed = useSettingValue("layout.columnsCollapsed.active", false)
  const discardedColumnCollapsed = useSettingValue("layout.columnsCollapsed.discarded", false)
  const doneColumnCollapsed = useSettingValue("layout.columnsCollapsed.done", false)

  const {isDesktop} = useDevice()

  const isMobileSidebarOpen = ref(false)

  const columnsCollapsed = computed<ColumnsCollapsed>(() => ({
    active: activeColumnCollapsed.value,
    discarded: discardedColumnCollapsed.value,
    done: doneColumnCollapsed.value,
  }))

  function toggleSidebarCollapse(isOpen?: boolean) {
    if (isDesktop.value) {
      isSidebarCollapsed.value = !isSidebarCollapsed.value
    } else {
      isMobileSidebarOpen.value = isOpen ?? !isMobileSidebarOpen.value
    }
  }

  function setTasksViewMode(mode: TasksViewMode) {
    tasksViewMode.value = mode
  }

  function toggleColumnsHideEmpty(value?: boolean) {
    columnsHideEmpty.value = value ?? !columnsHideEmpty.value
  }

  function toggleColumnCollapsed(status: TaskStatus) {
    if (status === "active") activeColumnCollapsed.value = !activeColumnCollapsed.value
    else if (status === "discarded") discardedColumnCollapsed.value = !discardedColumnCollapsed.value
    else doneColumnCollapsed.value = !doneColumnCollapsed.value
  }

  function setColumnCollapsed(status: TaskStatus, value: boolean) {
    if (status === "active") activeColumnCollapsed.value = value
    else if (status === "discarded") discardedColumnCollapsed.value = value
    else doneColumnCollapsed.value = value
  }

  return {
    isSidebarCollapsed,
    isMobileSidebarOpen,
    tasksViewMode,
    columnsHideEmpty,
    columnsCollapsed,

    toggleSidebarCollapse,
    setTasksViewMode,
    toggleColumnsHideEmpty,
    toggleColumnCollapsed,
    setColumnCollapsed,
  }
})
