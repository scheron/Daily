import {ref} from "vue"
import {invoke, useEventListener} from "@vueuse/core"
import {defineStore} from "pinia"

import {batchDebounce} from "@shared/utils/common/batchDebounce"
import {deepMerge} from "@shared/utils/common/deepMerge"
import {toRawDeep} from "@/utils/ui/vue"

import type {Settings} from "@shared/types/storage"

const SAVE_DEBOUNCE_MS = 300

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

  const scheduleSave = batchDebounce<Partial<Settings>>(
    async (batch) => {
      if (!Object.keys(batch).length) return
      try {
        await window.BridgeIPC["settings:save"](toRawDeep(batch))
      } catch (error) {
        console.error("Failed to save settings:", error)
        await loadSettings()
      }
    },
    SAVE_DEBOUNCE_MS,
    (acc, item) => deepMerge(acc, item) as Partial<Settings>,
    {},
  )

  function updateSettings(updates: Partial<Settings>) {
    const before = JSON.stringify(settings.value)
    settings.value = deepMerge(settings.value, updates) as Settings
    const after = JSON.stringify(settings.value)

    if (before === after) return

    scheduleSave(updates)
  }

  async function revalidate(): Promise<void> {
    isSettingsLoaded.value = false
    await loadSettings()
  }

  invoke(loadSettings)

  useEventListener(window, "beforeunload", () => scheduleSave.immediate())

  return {
    settings,
    isSettingsLoaded,

    loadSettings,
    updateSettings,
    revalidate,
  }
})
