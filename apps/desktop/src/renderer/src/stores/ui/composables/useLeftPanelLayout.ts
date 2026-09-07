import {useSettingValue} from "@/composables/useSettingsValue"

/**
 * Persisted visibility of the left panel.
 */
export function useLeftPanelLayout() {
  const leftPanelVisible = useSettingValue("layout.leftPanel.visible", true)

  function toggleLeftPanel(value?: boolean) {
    leftPanelVisible.value = value ?? !leftPanelVisible.value
  }

  return {
    leftPanelVisible,

    toggleLeftPanel,
  }
}
