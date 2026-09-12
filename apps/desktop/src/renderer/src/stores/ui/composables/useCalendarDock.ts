import {ref} from "vue"

/**
 * Whether the calendar dock floating over the board is expanded. Not persisted:
 * it always starts collapsed on launch.
 */
export function useCalendarDock() {
  const calendarDockExpanded = ref(false)

  /**
   * Flips the dock's expanded state, or sets it explicitly when `value` is given.
   */
  function toggleCalendarDock(value?: boolean) {
    calendarDockExpanded.value = value ?? !calendarDockExpanded.value
  }

  return {
    calendarDockExpanded,

    toggleCalendarDock,
  }
}
