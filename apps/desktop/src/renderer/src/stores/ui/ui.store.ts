import {defineStore} from "pinia"

import {useDevice} from "./composables/useDevice"
import {useLeftPanelLayout} from "./composables/useLeftPanelLayout"
import {useSectionPrefs} from "./composables/useSectionPrefs"

export const useUIStore = defineStore("ui", () => {
  const sections = useSectionPrefs()
  const leftPanel = useLeftPanelLayout()
  const device = useDevice()

  return {
    ...sections,
    ...leftPanel,
    ...device,
  }
})
