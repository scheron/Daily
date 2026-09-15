import {ref} from "vue"

import {useSettingValue} from "@/composables/useSettingValue"

export type CalendarDockTab = "days" | "milestones"

export function useCalendarDock() {
  const isCalendarDockExpanded = ref(false)
  const calendarDockTab = ref<CalendarDockTab>("days")
  const shouldOpenCalendarDockOnDrag = useSettingValue("layout.shouldOpenCalendarDockOnDrag", true)

  function toggleCalendarDock(isExpanded?: boolean) {
    isCalendarDockExpanded.value = isExpanded ?? !isCalendarDockExpanded.value
  }

  function setCalendarDockTab(tab: CalendarDockTab) {
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
