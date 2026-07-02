import {useLocalStorage} from "@vueuse/core"

import {deepClone} from "@shared/utils/common/deepClone"
import {useSettingValue} from "@/composables/useSettingsValue"
import {STORAGE_KEY_LEFT_PANEL} from "@/constants/storageKeys"
import {DEFAULT_LAYOUT, WIDGET_DEFS} from "@/constants/widgets"

import type {WidgetId, WidgetLayout} from "@/types/widgets"

/**
 * Left panel state: its persisted visibility and the widget-slot layout (validated
 * against the known widgets, with add / remove / move / resize controls).
 */
export function useLeftPanelLayout() {
  const leftPanelVisible = useSettingValue("layout.leftPanel.visible", true)

  const slots = useLocalStorage<WidgetLayout>(STORAGE_KEY_LEFT_PANEL, deepClone(DEFAULT_LAYOUT))
  const validWidgetIds = new Set<string>(Object.keys(WIDGET_DEFS))
  if (!slots.value.every((slot) => slot && validWidgetIds.has(slot.id))) slots.value = deepClone(DEFAULT_LAYOUT)

  function toggleLeftPanel(value?: boolean) {
    leftPanelVisible.value = value ?? !leftPanelVisible.value
  }

  function setSlotWidget(index: number, widgetId: WidgetId) {
    const slot = slots.value[index]
    if (!slot) return

    slots.value[index].id = widgetId
  }

  function setSlotHeight(index: number, height: number) {
    const slot = slots.value[index]
    if (!slot) return

    slots.value[index].height = height
  }

  function addSlot(widgetId: WidgetId, height: number) {
    slots.value.push({id: widgetId, height: height})
  }

  function removeSlot(index: number) {
    if (!slots.value[index]) return
    slots.value.splice(index, 1)
  }

  function moveSlot(fromIndex: number, toIndex: number) {
    if (!slots.value[fromIndex] || !slots.value[toIndex]) return

    const [moved] = slots.value.splice(fromIndex, 1)
    slots.value.splice(toIndex, 0, moved)
  }

  return {
    leftPanelVisible,
    slots,

    toggleLeftPanel,
    setSlotWidget,
    setSlotHeight,
    addSlot,
    removeSlot,
    moveSlot,
  }
}
