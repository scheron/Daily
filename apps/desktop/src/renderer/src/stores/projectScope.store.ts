import {computed} from "vue"
import {defineStore} from "pinia"

import {useSettingsStore} from "@/stores/settings.store"
import {useUIStore} from "@/stores/ui"

export const useProjectScopeStore = defineStore("projectScope", () => {
  const settingsStore = useSettingsStore()
  const uiStore = useUIStore()

  const isAllProjectsFlag = computed(() => Boolean(settingsStore.settings?.branch?.isAllProjects))

  const isAllProjectsMode = computed(() => isAllProjectsFlag.value && uiStore.frame === "day")

  async function setAllProjects(isOn: boolean): Promise<void> {
    const branch = settingsStore.settings?.branch
    if (!branch || Boolean(branch.isAllProjects) === isOn) return

    settingsStore.updateSettings({branch: {...branch, isAllProjects: isOn}})
    await settingsStore.flush()
  }

  return {
    isAllProjectsMode,

    setAllProjects,
  }
})
