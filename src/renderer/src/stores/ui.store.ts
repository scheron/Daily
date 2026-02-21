import {computed, ref} from "vue"
import {defineStore} from "pinia"

import {useDevice} from "@/composables/useDevice"
import {useSettingValue} from "@/composables/useSettingsValue"

import type {TaskStatus} from "@shared/types/storage"

export type TasksViewMode = "list" | "columns"
export type SidebarSection = "calendar" | "tags" | "themes" | "settings" | "search" | "deleted" | "assistant"
type ColumnsCollapsed = Record<TaskStatus, boolean>

export const useUIStore = defineStore("ui", () => {
  const isSidebarCollapsed = useSettingValue("sidebar.collapsed", false)
  const tasksViewMode = useSettingValue("layout.type", "list" as TasksViewMode)
  const columnsHideEmpty = useSettingValue("layout.columnsHideEmpty", false)
  const columnsAutoCollapseEmpty = useSettingValue("layout.columnsAutoCollapseEmpty", false)
  const activeColumnCollapsed = useSettingValue("layout.columnsCollapsed.active", false)
  const discardedColumnCollapsed = useSettingValue("layout.columnsCollapsed.discarded", false)
  const doneColumnCollapsed = useSettingValue("layout.columnsCollapsed.done", false)

  const {isDesktop} = useDevice()

  const isMobileSidebarOpen = ref(false)
  const activeSidebarSection = ref<SidebarSection>("calendar")

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

  function toggleTasksViewMode() {
    tasksViewMode.value = tasksViewMode.value === "list" ? "columns" : "list"
  }

  function setActiveSidebarSection(section: SidebarSection) {
    activeSidebarSection.value = section
  }

  function openSidebarSection(section: SidebarSection) {
    activeSidebarSection.value = section

    if (isDesktop.value) {
      isSidebarCollapsed.value = false
      return
    }

    isMobileSidebarOpen.value = true
  }

  function toggleColumnsHideEmpty(value?: boolean) {
    const nextValue = value ?? !columnsHideEmpty.value

    if (!nextValue) {
      columnsHideEmpty.value = false
      return
    }

    if (columnsAutoCollapseEmpty.value) columnsAutoCollapseEmpty.value = false
    columnsHideEmpty.value = true
  }

  function toggleColumnsAutoCollapseEmpty(value?: boolean) {
    const nextValue = value ?? !columnsAutoCollapseEmpty.value

    if (!nextValue) {
      columnsAutoCollapseEmpty.value = false
      return
    }

    if (columnsHideEmpty.value) columnsHideEmpty.value = false

    columnsAutoCollapseEmpty.value = true
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
    activeSidebarSection,
    tasksViewMode,
    columnsHideEmpty,
    columnsAutoCollapseEmpty,
    columnsCollapsed,

    toggleSidebarCollapse,
    setTasksViewMode,
    toggleTasksViewMode,
    setActiveSidebarSection,
    openSidebarSection,
    toggleColumnsHideEmpty,
    toggleColumnsAutoCollapseEmpty,
    toggleColumnCollapsed,
    setColumnCollapsed,
  }
})
