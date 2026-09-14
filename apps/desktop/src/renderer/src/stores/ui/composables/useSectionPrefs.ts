import {computed} from "vue"

import {useSettingValue} from "@/composables/useSettingsValue"

import type {TaskStatus} from "@daily/protocol"

type SectionsCollapsed = Record<TaskStatus, boolean>

/** How empty task columns behave: shown as-is, auto-collapsed, or hidden entirely. */
export type EmptySectionsMode = "show" | "collapse" | "hide"

/**
 * Persisted display preferences for the task status sections: empty-section handling
 * and per-status collapsed state.
 */
export function useSectionPrefs() {
  const shouldHideEmptySections = useSettingValue("layout.sectionsHideEmpty", false)
  const shouldCollapseEmptySections = useSettingValue("layout.sectionsAutoCollapseEmpty", false)
  const isActiveSectionCollapsed = useSettingValue("layout.sectionsCollapsed.active", false)
  const isDiscardedSectionCollapsed = useSettingValue("layout.sectionsCollapsed.discarded", false)
  const isDoneSectionCollapsed = useSettingValue("layout.sectionsCollapsed.done", false)
  const isBacklogSectionCollapsed = useSettingValue("layout.sectionsCollapsed.backlog", false)

  const sectionsCollapsed = computed<SectionsCollapsed>(() => ({
    active: isActiveSectionCollapsed.value,
    discarded: isDiscardedSectionCollapsed.value,
    done: isDoneSectionCollapsed.value,
    backlog: isBacklogSectionCollapsed.value,
  }))

  const emptySectionsMode = computed<EmptySectionsMode>({
    get: () => (shouldHideEmptySections.value ? "hide" : shouldCollapseEmptySections.value ? "collapse" : "show"),
    set: (mode) => {
      shouldHideEmptySections.value = mode === "hide"
      shouldCollapseEmptySections.value = mode === "collapse"
    },
  })

  function toggleSectionCollapsed(status: TaskStatus) {
    if (status === "active") isActiveSectionCollapsed.value = !isActiveSectionCollapsed.value
    else if (status === "discarded") isDiscardedSectionCollapsed.value = !isDiscardedSectionCollapsed.value
    else if (status === "backlog") isBacklogSectionCollapsed.value = !isBacklogSectionCollapsed.value
    else isDoneSectionCollapsed.value = !isDoneSectionCollapsed.value
  }

  function setSectionCollapsed(status: TaskStatus, isCollapsed: boolean) {
    if (status === "active") isActiveSectionCollapsed.value = isCollapsed
    else if (status === "discarded") isDiscardedSectionCollapsed.value = isCollapsed
    else if (status === "backlog") isBacklogSectionCollapsed.value = isCollapsed
    else isDoneSectionCollapsed.value = isCollapsed
  }

  return {
    shouldHideEmptySections,
    shouldCollapseEmptySections,
    sectionsCollapsed,
    emptySectionsMode,

    toggleSectionCollapsed,
    setSectionCollapsed,
  }
}
