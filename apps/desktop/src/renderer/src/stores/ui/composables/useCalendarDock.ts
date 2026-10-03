import {ref} from "vue"

export type CalendarDockTab = "days" | "milestones"

export function useCalendarDock() {
  const isCalendarDockExpanded = ref(false)
  const calendarDockTab = ref<CalendarDockTab>("days")

  function toggleCalendarDock(isExpanded?: boolean) {
    isCalendarDockExpanded.value = isExpanded ?? !isCalendarDockExpanded.value
  }

  function setCalendarDockTab(tab: CalendarDockTab) {
    calendarDockTab.value = tab
  }

  return {
    isCalendarDockExpanded,
    calendarDockTab,

    toggleCalendarDock,
    setCalendarDockTab,
  }
}
