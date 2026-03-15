import {computed, ref} from "vue"
import {defineStore} from "pinia"

import {useSettingValue} from "@/composables/useSettingsValue"

import type {SettingsPanel} from "@/types/common"
import type {LayoutType, TaskStatus} from "@shared/types/storage"

type ColumnsCollapsed = Record<TaskStatus, boolean>

export const useUIStore = defineStore("ui", () => {
  const tasksViewMode = useSettingValue("layout.type", "list" as LayoutType)
  const columnsHideEmpty = useSettingValue("layout.columnsHideEmpty", false)
  const columnsAutoCollapseEmpty = useSettingValue("layout.columnsAutoCollapseEmpty", false)
  const activeColumnCollapsed = useSettingValue("layout.columnsCollapsed.active", false)
  const discardedColumnCollapsed = useSettingValue("layout.columnsCollapsed.discarded", false)
  const doneColumnCollapsed = useSettingValue("layout.columnsCollapsed.done", false)

  const activeSettingsPanel = ref<SettingsPanel>(null)
  const isSearchModalOpen = ref(false)
  const isDeletedTasksModalOpen = ref(false)

  const columnsCollapsed = computed<ColumnsCollapsed>(() => ({
    active: activeColumnCollapsed.value,
    discarded: discardedColumnCollapsed.value,
    done: doneColumnCollapsed.value,
  }))

  function setTasksViewMode(mode: LayoutType) {
    tasksViewMode.value = mode
  }

  function toggleTasksViewMode() {
    tasksViewMode.value = tasksViewMode.value === "list" ? "columns" : "list"
  }

  function toggleSearchModal() {
    isSearchModalOpen.value = !isSearchModalOpen.value
  }

  function closeSearchModal() {
    isSearchModalOpen.value = false
  }

  function toggleDeletedTasksModal() {
    isDeletedTasksModalOpen.value = !isDeletedTasksModalOpen.value
  }

  function closeDeletedTasksModal() {
    isDeletedTasksModalOpen.value = false
  }

  function setActiveSettingsPanel(panel: SettingsPanel) {
    activeSettingsPanel.value = panel
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
    activeSettingsPanel,
    isSearchModalOpen,
    isDeletedTasksModalOpen,
    tasksViewMode,
    columnsHideEmpty,
    columnsAutoCollapseEmpty,
    columnsCollapsed,

    setTasksViewMode,
    toggleTasksViewMode,
    setActiveSettingsPanel,
    toggleSearchModal,
    closeSearchModal,
    toggleDeletedTasksModal,
    closeDeletedTasksModal,
    toggleColumnsHideEmpty,
    toggleColumnsAutoCollapseEmpty,
    toggleColumnCollapsed,
    setColumnCollapsed,
  }
})
