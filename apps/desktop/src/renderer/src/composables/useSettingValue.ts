import {computed} from "vue"

import {getObjectValueFromPath, transformObjectFromPath} from "@daily/std"

import {useSettingsStore} from "@/stores/settings.store"

import type {Settings} from "@daily/protocol"

type FlattenObjectPaths<T extends object, Prefix extends string = ""> = {
  [K in keyof T]: T[K] extends object
    ? FlattenObjectPaths<T[K], `${Prefix}${Prefix extends "" ? "" : "."}${K & string}`>
    : `${Prefix}${Prefix extends "" ? "" : "."}${K & string}`
}[keyof T]

type SettingsKey = FlattenObjectPaths<Settings>

export function useSettingValue<K extends SettingsKey, T = any>(key: K, defaultValue: T) {
  const settingsStore = useSettingsStore()

  function getSettingValue(): T {
    if (!settingsStore.settings) return defaultValue

    try {
      const result = getObjectValueFromPath<any>(settingsStore.settings, key)
      return result ?? defaultValue
    } catch (error) {
      console.error("Failed to get setting value:", error)
      return defaultValue
    }
  }

  async function setSettingValue(value: any): Promise<void> {
    if (!settingsStore.settings) return

    const updated = transformObjectFromPath(key, value) as Partial<Settings>
    settingsStore.updateSettings(updated)
  }

  return computed({
    get: () => getSettingValue(),
    set: (value: T) => setSettingValue(value),
  })
}
