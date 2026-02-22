import {ref} from "vue"
import {invoke} from "@vueuse/core"
import {defineStore} from "pinia"

import {deepMerge} from "@shared/utils/common/deepMerge"
import {toRawDeep} from "@/utils/ui/vue"

import type {Settings} from "@shared/types/storage"

export const useSettingsStore = defineStore("settings", () => {
  const settings = ref<Settings | null>(null)
  const isSettingsLoaded = ref(false)

  async function loadSettings(): Promise<void> {
    if (isSettingsLoaded.value) return

    try {
      settings.value = await window.BridgeIPC["settings:load"]()
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
      await window.BridgeIPC["settings:save"](toRawDeep(updates))
    } catch (error) {
      console.error("Failed to save settings:", error)
      await loadSettings()
    }
  }

  async function revalidate(): Promise<void> {
    isSettingsLoaded.value = false
    await loadSettings()
  }

  invoke(loadSettings)

  return {
    settings,
    isSettingsLoaded,

    loadSettings,
    updateSettings,
    revalidate,
  }
})
