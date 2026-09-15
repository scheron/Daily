import {computed} from "vue"
import {defineStore} from "pinia"

import {useSettingsStore} from "@/stores/settings.store"
import {updateAiConfig} from "./utils/updateAiConfig"

import type {AIConfig} from "@daily/protocol"

export const useRemoteModelStore = defineStore("remoteModel", () => {
  const settingsStore = useSettingsStore()

  const availableModels = computed(() => settingsStore.settings?.ai?.openai?.availableModels ?? [])

  async function setAvailableModels(models: string[]) {
    await updateAiConfig({openai: {availableModels: models} as AIConfig["openai"]})
  }

  async function selectModel(model: string) {
    await updateAiConfig({provider: "openai", openai: {model} as AIConfig["openai"]})
  }

  return {
    availableModels,

    setAvailableModels,
    selectModel,
  }
})
