import {defineStore} from "pinia"

import {useBoardFrame} from "./composables/useBoardFrame"
import {useCalendarDock} from "./composables/useCalendarDock"
import {useSectionPrefs} from "./composables/useSectionPrefs"

export const useUiStore = defineStore("ui", () => {
  const sections = useSectionPrefs()
  const calendarDock = useCalendarDock()
  const boardFrame = useBoardFrame()

  return {
    ...sections,
    ...calendarDock,
    ...boardFrame,
  }
})
