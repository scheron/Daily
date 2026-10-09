import {computed} from "vue"

import {BOARD_CARD_GAP, BOARD_CARD_HEIGHT, COMPACT_BOARD_CARD_HEIGHT} from "@/constants/ui"
import {useSettingValue} from "./useSettingValue"

import type {FontSize, TaskView} from "@daily/protocol"

/** Reactive card dimensions shared by presentation, virtual columns, navigation and drag placement. */
export function useBoardCardGeometry() {
  const storedTaskView = useSettingValue<"appearance.taskView", TaskView>("appearance.taskView", "regular")
  const fontSize = useSettingValue<"typography.fontSize", FontSize>("typography.fontSize", "normal")
  const fontSizePx: Record<FontSize, number> = {small: 13, normal: 15, large: 17}
  const taskView = computed<TaskView>({
    get: () => (storedTaskView.value === "compact" ? "compact" : "regular"),
    set: (value) => {
      storedTaskView.value = value === "compact" ? "compact" : "regular"
    },
  })
  const isCompact = computed(() => taskView.value === "compact")
  const cardHeight = computed(() => (isCompact.value ? (COMPACT_BOARD_CARD_HEIGHT * (fontSizePx[fontSize.value] ?? 15)) / 15 : BOARD_CARD_HEIGHT))
  const cardStep = computed(() => cardHeight.value + BOARD_CARD_GAP)

  return {taskView, fontSize, isCompact, cardHeight, cardStep}
}
