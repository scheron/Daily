import {ref} from "vue"
import {invoke} from "@vueuse/core"
import {deepMerge} from "@/utils/deepMerge"
import {toRawDeep} from "@/utils/vue"
import {defineStore} from "pinia"

import type {Settings} from "@/types/settings"

export const useSettingsStore = defineStore("settings", () => {
  const settings = ref<Settings | null>(null)
  const isSettingsLoaded = ref(false)

  async function loadSettings(): Promise<void> {
    if (isSettingsLoaded.value || settings.value) return

    try {
      settings.value = await window.electronAPI.loadSettings()
    } catch (error) {
      console.error("Failed to load settings:", error)
    } finally {
      isSettingsLoaded.value = true
    }
  }

  async function updateSettings(updates: Partial<Settings>): Promise<void> {
    const before = JSON.stringify(settings.value)
    settings.value = deepMerge(settings.value, updates) as Settings
    const after = JSON.stringify(settings.value)

    if (before === after) return

    try {
      await window.electronAPI.saveSettings(toRawDeep(settings.value))
    } catch (error) {
      console.error("Failed to save settings:", error)
      await loadSettings()
    }
  }

  invoke(loadSettings)

  return {
    settings,
    isSettingsLoaded,

    loadSettings,
    updateSettings,
  }
})
