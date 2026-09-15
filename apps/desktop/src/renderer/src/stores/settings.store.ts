import {ref} from "vue"
import {invoke, useEventListener} from "@vueuse/core"
import {defineStore} from "pinia"

import {batchDebounce, deepMerge} from "@daily/std"

import {toRawDeep} from "@/utils/ui/toRawDeep"

import type {SettingsView} from "@daily/protocol"

export const useSettingsStore = defineStore("settings", () => {
  const settings = ref<SettingsView | null>(null)
  const isSettingsLoaded = ref(false)

  const scheduleSave = batchDebounce<Partial<SettingsView>>(
    async (batch) => {
      if (!Object.keys(batch).length) return
      try {
        await window.BridgeIPC["settings:save"](toRawDeep(batch))
      } catch (error) {
        console.error("Failed to save settings:", error)
        await loadSettings()
      }
    },
    300,
    (acc, item) => deepMerge(acc, item) as Partial<SettingsView>,
    {},
  )

  useEventListener(window, "beforeunload", () => scheduleSave.immediate())

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

  function updateSettings(updates: Partial<SettingsView>) {
    const before = JSON.stringify(settings.value)
    settings.value = deepMerge(settings.value, updates) as SettingsView
    const after = JSON.stringify(settings.value)

    if (before === after) return

    scheduleSave(updates)
  }

  async function revalidate(): Promise<void> {
    isSettingsLoaded.value = false
    await loadSettings()
  }

  invoke(loadSettings)

  return {
    settings,
    isSettingsLoaded,

    updateSettings,
    revalidate,
  }
})
