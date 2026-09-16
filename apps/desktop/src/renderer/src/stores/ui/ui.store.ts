import {defineStore} from "pinia"

import {useCalendarDock} from "./composables/useCalendarDock"
import {useSectionPrefs} from "./composables/useSectionPrefs"

export const useUIStore = defineStore("ui", () => {
  const sections = useSectionPrefs()
  const calendarDock = useCalendarDock()

  return {
    ...sections,
    ...calendarDock,
  }
})
