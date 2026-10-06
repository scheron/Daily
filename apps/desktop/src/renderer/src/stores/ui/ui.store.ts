import {defineStore} from "pinia"

import {useBoardFrame} from "./composables/useBoardFrame"
import {useCalendarDock} from "./composables/useCalendarDock"
import {useFocusDock} from "./composables/useFocusDock"
import {useSectionPrefs} from "./composables/useSectionPrefs"

export const useUIStore = defineStore("ui", () => {
  const sections = useSectionPrefs()
  const calendarDock = useCalendarDock()
  const focusDock = useFocusDock()
  const boardFrame = useBoardFrame()

  return {
    ...sections,
    ...calendarDock,
    ...focusDock,
    ...boardFrame,
  }
})
