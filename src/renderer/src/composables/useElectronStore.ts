import {ref, watch} from "vue"
import {invoke} from "@vueuse/core"

import type {Settings} from "@/types/settings"

export function useElectronStore<K extends keyof Settings, T = Settings[K]>(key: K, defaultValue?: T) {
  const value = ref<T | undefined>()

  async function getInitialValue(): Promise<T | undefined> {
    try {
      const settings = await window.electronAPI.getSettings()
      const result = settings?.[key] as T | undefined
      return result ?? defaultValue
    } catch {
      return defaultValue
    }
  }

  invoke(async () => {
    value.value = await getInitialValue()

    watch(value, (newVal) => {
      window.electronAPI.saveSettings({[key]: newVal})
    })
  })

  return value
}
