import {computed} from "vue"

import {useSettingValue} from "@/composables/useSettingValue"

import type {TaskStatus} from "@daily/protocol"

type SectionsCollapsed = Record<TaskStatus, boolean>

export function useSectionPrefs() {
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
    sectionsCollapsed,

    toggleSectionCollapsed,
    setSectionCollapsed,
  }
}
