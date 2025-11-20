import {computed} from "vue"
import {useSettingsStore} from "@/stores/settings.store"
import {getObjectValueFromPath, transformObjectFromPath} from "@/utils/objects"

import type {Settings} from "@/types/settings"

type FlattenObjectPaths<T extends object, Prefix extends string = ""> = {
  [K in keyof T]: T[K] extends object
    ? FlattenObjectPaths<T[K], `${Prefix}${Prefix extends "" ? "" : "."}${K & string}`>
    : `${Prefix}${Prefix extends "" ? "" : "."}${K & string}`
}[keyof T]

export type SettingsKey = FlattenObjectPaths<Settings>

export function useSettingValue<K extends SettingsKey, T = any>(key: K, defaultValue?: T) {
  const settingsStore = useSettingsStore()

  function getSettingValue<K extends SettingsKey, T = any>(key: K, defaultValue?: T): T {
    if (!settingsStore.settings) return defaultValue as T

    try {
      const result = getObjectValueFromPath<any>(settingsStore.settings, key)
      return result ?? (defaultValue as T)
    } catch (error) {
      console.error("Failed to get setting value:", error)
      return defaultValue as T
    }
  }

  async function setSettingsValue<K extends SettingsKey>(key: K, value: any): Promise<void> {
    if (!settingsStore.settings) return

    const updated = transformObjectFromPath(key, value) as Partial<Settings>
    console.log("updated", updated)
    settingsStore.updateSettings(updated)
  }

  return computed({
    get: () => getSettingValue<K, T>(key, defaultValue),
    set: (value: T) => setSettingsValue<K>(key, value),
  })
}
