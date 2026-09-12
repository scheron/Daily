import {ref} from "vue"

/**
 * Whether the calendar dock floating over the board is expanded, and which of its two tabs
 * — days, milestones — its panel shows. Neither is persisted: the app always starts
 * collapsed, on the days tab.
 */
export function useCalendarDock() {
  const calendarDockExpanded = ref(false)
  const calendarDockTab = ref<"days" | "milestones">("days")

  /**
   * Flips the dock's expanded state, or sets it explicitly when `value` is given.
   */
  function toggleCalendarDock(value?: boolean) {
    calendarDockExpanded.value = value ?? !calendarDockExpanded.value
  }

  /**
   * Switches the dock's panel between the calendar and the milestone list.
   */
  function setCalendarDockTab(tab: "days" | "milestones") {
    calendarDockTab.value = tab
  }

  return {
    calendarDockExpanded,
    calendarDockTab,

    toggleCalendarDock,
    setCalendarDockTab,
  }
}
