import {ref} from "vue"

import {useSettingValue} from "@/composables/useSettingsValue"

export function useCalendarDock() {
  const isCalendarDockExpanded = ref(false)
  const calendarDockTab = ref<"days" | "milestones">("days")
  const shouldOpenCalendarDockOnDrag = useSettingValue("layout.shouldOpenCalendarDockOnDrag", true)

  function toggleCalendarDock(isExpanded?: boolean) {
    isCalendarDockExpanded.value = isExpanded ?? !isCalendarDockExpanded.value
  }

  function setCalendarDockTab(tab: "days" | "milestones") {
    calendarDockTab.value = tab
  }

  return {
    isCalendarDockExpanded,
    calendarDockTab,
    shouldOpenCalendarDockOnDrag,

    toggleCalendarDock,
    setCalendarDockTab,
  }
}
