import {computed} from "vue"

import {useSettingValue} from "@/composables/useSettingValue"

import type {TaskStatus} from "@daily/protocol"

type SectionsCollapsed = Record<TaskStatus, boolean>

export function useSectionPrefs() {
  const isTodoSectionCollapsed = useSettingValue("layout.sectionsCollapsed.todo", false)
  const isActiveSectionCollapsed = useSettingValue("layout.sectionsCollapsed.in_progress", false)
  const isDiscardedSectionCollapsed = useSettingValue("layout.sectionsCollapsed.cancelled", false)
  const isReadySectionCollapsed = useSettingValue("layout.sectionsCollapsed.ready_for_agent", false)
  const isMergeSectionCollapsed = useSettingValue("layout.sectionsCollapsed.ready_to_merge", false)
  const isDoneSectionCollapsed = useSettingValue("layout.sectionsCollapsed.done", false)
  const isBacklogSectionCollapsed = useSettingValue("layout.sectionsCollapsed.backlog", false)

  const sectionsCollapsed = computed<SectionsCollapsed>(() => ({
    ready_for_agent: isReadySectionCollapsed.value,
    ready_to_merge: isMergeSectionCollapsed.value,
    in_progress: isActiveSectionCollapsed.value,
    cancelled: isDiscardedSectionCollapsed.value,
    done: isDoneSectionCollapsed.value,
    backlog: isBacklogSectionCollapsed.value,
    todo: isTodoSectionCollapsed.value,
  }))

  function toggleSectionCollapsed(status: TaskStatus) {
    if (status === "in_progress") isActiveSectionCollapsed.value = !isActiveSectionCollapsed.value
    else if (status === "cancelled") isDiscardedSectionCollapsed.value = !isDiscardedSectionCollapsed.value
    else if (status === "todo") isTodoSectionCollapsed.value = !isTodoSectionCollapsed.value
    else if (status === "backlog") isBacklogSectionCollapsed.value = !isBacklogSectionCollapsed.value
    else if (status === "ready_for_agent") isReadySectionCollapsed.value = !isReadySectionCollapsed.value
    else if (status === "ready_to_merge") isMergeSectionCollapsed.value = !isMergeSectionCollapsed.value
    else isDoneSectionCollapsed.value = !isDoneSectionCollapsed.value
  }

  function setSectionCollapsed(status: TaskStatus, isCollapsed: boolean) {
    if (status === "in_progress") isActiveSectionCollapsed.value = isCollapsed
    else if (status === "cancelled") isDiscardedSectionCollapsed.value = isCollapsed
    else if (status === "todo") isTodoSectionCollapsed.value = isCollapsed
    else if (status === "backlog") isBacklogSectionCollapsed.value = isCollapsed
    else if (status === "ready_for_agent") isReadySectionCollapsed.value = isCollapsed
    else if (status === "ready_to_merge") isMergeSectionCollapsed.value = isCollapsed
    else isDoneSectionCollapsed.value = isCollapsed
  }

  return {
    sectionsCollapsed,

    toggleSectionCollapsed,
    setSectionCollapsed,
  }
}
