import {ref} from "vue"
import {defineStore} from "pinia"

import {API} from "@/api"
import {useSettingsStore} from "./settings.store"

import type {Task} from "@shared/types/storage"

export const useDeletedTasksStore = defineStore("deletedTasks", () => {
  const settingsStore = useSettingsStore()

  const isLoaded = ref(false)
  const deletedTasks = ref<Task[]>([])

  async function load() {
    isLoaded.value = false

    try {
      deletedTasks.value = await API.getDeletedTasks({branchId: settingsStore.settings?.branch?.activeId})
    } catch (error) {
      console.error("Error loading deleted tasks:", error)
    } finally {
      isLoaded.value = true
    }
  }

  async function revalidate() {
    try {
      deletedTasks.value = await API.getDeletedTasks({branchId: settingsStore.settings?.branch?.activeId})
    } catch (error) {
      console.error("Error revalidating deleted tasks:", error)
    }
  }

  return {
    isLoaded,
    deletedTasks,

    load,
    revalidate,
  }
})
