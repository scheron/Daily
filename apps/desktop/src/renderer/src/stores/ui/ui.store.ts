import {defineStore} from "pinia"

import {useCalendarDock} from "./composables/useCalendarDock"
import {useDevice} from "./composables/useDevice"
import {useSectionPrefs} from "./composables/useSectionPrefs"

export const useUIStore = defineStore("ui", () => {
  const sections = useSectionPrefs()
  const device = useDevice()
  const calendarDock = useCalendarDock()

  return {
    ...sections,
    ...device,
    ...calendarDock,
  }
})
