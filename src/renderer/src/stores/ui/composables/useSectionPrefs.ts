import {computed} from "vue"

import {useSettingValue} from "@/composables/useSettingsValue"

import type {TaskStatus} from "@shared/types/storage"

type SectionsCollapsed = Record<TaskStatus, boolean>

/** How empty task columns behave: shown as-is, auto-collapsed, or hidden entirely. */
export type EmptySectionsMode = "show" | "collapse" | "hide"

/**
 * Persisted display preferences for the task status sections: empty-section handling
 * and per-status collapsed state.
 */
export function useSectionPrefs() {
  const sectionsHideEmpty = useSettingValue("layout.sectionsHideEmpty", false)
  const sectionsAutoCollapseEmpty = useSettingValue("layout.sectionsAutoCollapseEmpty", false)
  const activeSectionCollapsed = useSettingValue("layout.sectionsCollapsed.active", false)
  const discardedSectionCollapsed = useSettingValue("layout.sectionsCollapsed.discarded", false)
  const doneSectionCollapsed = useSettingValue("layout.sectionsCollapsed.done", false)

  const sectionsCollapsed = computed<SectionsCollapsed>(() => ({
    active: activeSectionCollapsed.value,
    discarded: discardedSectionCollapsed.value,
    done: doneSectionCollapsed.value,
  }))

  const emptySectionsMode = computed<EmptySectionsMode>({
    get: () => (sectionsHideEmpty.value ? "hide" : sectionsAutoCollapseEmpty.value ? "collapse" : "show"),
    set: (mode) => {
      sectionsHideEmpty.value = mode === "hide"
      sectionsAutoCollapseEmpty.value = mode === "collapse"
    },
  })

  function toggleSectionCollapsed(status: TaskStatus) {
    if (status === "active") activeSectionCollapsed.value = !activeSectionCollapsed.value
    else if (status === "discarded") discardedSectionCollapsed.value = !discardedSectionCollapsed.value
    else doneSectionCollapsed.value = !doneSectionCollapsed.value
  }

  function setSectionCollapsed(status: TaskStatus, value: boolean) {
    if (status === "active") activeSectionCollapsed.value = value
    else if (status === "discarded") discardedSectionCollapsed.value = value
    else doneSectionCollapsed.value = value
  }

  return {
    sectionsHideEmpty,
    sectionsAutoCollapseEmpty,
    sectionsCollapsed,
    emptySectionsMode,

    toggleSectionCollapsed,
    setSectionCollapsed,
  }
}
