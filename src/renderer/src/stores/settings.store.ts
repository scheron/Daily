import {ref} from "vue"
import {invoke} from "@vueuse/core"
import {deepMerge} from "@/utils/deepMerge"
import {defineStore} from "pinia"

import type {Settings} from "@/types/settings"
import { toRawDeep } from "@/utils/vue"

export const useSettingsStore = defineStore("settings", () => {
  const settings = ref<Settings | null>(null)

  async function loadSettings(): Promise<void> {
    try {
      settings.value = await window.electronAPI.loadSettings()
    } catch (error) {
      console.error("Failed to load settings:", error)
    }
  }

  async function updateSettings(updates: Partial<Settings>): Promise<void> {
    settings.value = deepMerge(settings.value, updates) as Settings

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

    loadSettings,
    updateSettings,
  }
})
