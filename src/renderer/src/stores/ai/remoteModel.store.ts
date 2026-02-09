import {computed} from "vue"
import {defineStore} from "pinia"

import {useSettingsStore} from "@/stores/settings.store"
import {toRawDeep} from "@/utils/ui/vue"

import type {AIConfig} from "@shared/types/ai"

export const useRemoteModelStore = defineStore("remoteModel", () => {
  const settingsStore = useSettingsStore()

  const availableModels = computed(() => settingsStore.settings?.ai?.openai?.availableModels ?? [])
  const activeModel = computed(() => settingsStore.settings?.ai?.openai?.model ?? "")

  async function updateConfig(updates: Partial<AIConfig>) {
    const success = await window.BridgeIPC["ai:update-config"](toRawDeep(updates))
    if (success) await settingsStore.revalidate()
  }

  async function setAvailableModels(models: string[]) {
    await updateConfig({openai: {availableModels: models} as AIConfig["openai"]})
  }

  async function selectModel(model: string) {
    await updateConfig({provider: "openai", openai: {model} as AIConfig["openai"]})
  }

  return {
    availableModels,
    activeModel,

    setAvailableModels,
    selectModel,
  }
})
