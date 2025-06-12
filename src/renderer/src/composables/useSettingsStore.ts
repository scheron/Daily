import {ref, watch} from "vue"
import {invoke} from "@vueuse/core"
import {getObjectValueFromPath, transformObjectFromPath} from "@/utils/objects"

import type {Settings} from "@/types/settings"

type FlattenObjectPaths<T extends object, Prefix extends string = ""> = {
  [K in keyof T]: T[K] extends object
    ? FlattenObjectPaths<T[K], `${Prefix}${Prefix extends "" ? "" : "."}${K & string}`>
    : `${Prefix}${Prefix extends "" ? "" : "."}${K & string}`
}[keyof T]

type SettingsKey = FlattenObjectPaths<Settings>

export function useSettingsStore<K extends SettingsKey, T = any>(key: K, defaultValue?: T) {
  const value = ref<T>()

  async function getInitialValue(): Promise<T> {
    try {
      console.log("getInitialValue", window.electronAPI.getSettings())
      const settings = await window.electronAPI.getSettings()
      const result = getObjectValueFromPath<any>(settings, key)
      return result ?? defaultValue as T
    } catch {
      return defaultValue as T
    }
  }

  invoke(async () => {
    value.value = await getInitialValue()

    watch(value, (newVal) => {
      window.electronAPI.saveSettings(transformObjectFromPath(key, newVal))
    })
  })

  return value
}
