<script setup lang="ts">
import {onMounted, ref} from "vue"
import {toasts} from "vue-toasts-lite"

import {withElapsedDelay} from "@shared/utils/common/withElapsedDelay"
import {useStorageStore} from "@/stores/storage.store"
import {useTasksStore} from "@/stores/tasks.store"
import {useLoadingState} from "@/composables/useLoadingState"
import {highlightElement, scrollToElement} from "@/utils/ui/dom"
import BaseIcon from "@/ui/base/BaseIcon"
import BaseSkeleton from "@/ui/base/BaseSkeleton.vue"

import {API} from "@/api"
import DeletedTaskItem from "./{fragments}/DeletedTaskItem.vue"

import type {Task} from "@shared/types/storage"

const tasksStore = useTasksStore()
const storageStore = useStorageStore()

const deletedTasks = ref<Task[]>([])
const {isLoading, isLoaded, setState} = useLoadingState("IDLE")

async function onRestore(task: Task) {
  const restoredTask = await API.restoreTask(task.id)

  if (restoredTask) {
    toasts.success("Task restored successfully")

    tasksStore.setActiveDay(restoredTask.scheduled.date)
    setTimeout(async () => {
      const scrolled = await scrollToElement(restoredTask.id)
      if (scrolled) highlightElement(restoredTask.id, {class: "highlight", duration: 2000})
    }, 100)
  } else {
    toasts.error("Failed to restore task")
  }
}

onMounted(async () => {
  setState("LOADING")
  deletedTasks.value = await withElapsedDelay(() => API.getDeletedTasks(), 500)
  setState("LOADED")
})

storageStore.onStorageDataChanged(async () => {
  deletedTasks.value = await API.getDeletedTasks()
})
</script>

<template>
  <div class="flex flex-1 flex-col gap-3">
    <div v-if="isLoading" class="text-base-content/60 flex h-full flex-col items-center justify-center gap-3">
      <BaseSkeleton v-for="i in 3" :key="i" class="h-24 w-full" />
    </div>

    <div v-else-if="isLoaded && deletedTasks.length" class="flex flex-1 flex-col gap-2 overflow-y-auto">
      <DeletedTaskItem v-for="task in deletedTasks" :key="task.id" :task="task" @restore="onRestore" />
    </div>

    <div v-else class="text-base-content/50 flex flex-1 flex-col items-center justify-center gap-3 text-center">
      <BaseIcon name="empty" class="size-12" />
      <div class="space-y-1">
        <p class="text-sm font-medium">No deleted tasks</p>
        <p class="text-xs">Deleted tasks will appear here</p>
      </div>
    </div>
  </div>
</template>
