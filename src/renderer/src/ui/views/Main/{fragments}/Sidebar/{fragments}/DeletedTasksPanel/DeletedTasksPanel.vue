<script setup lang="ts">
import {onMounted, ref, watch} from "vue"
import {toast} from "vue-sonner"

import {useStorageStore} from "@/stores/storage.store"
import {useTasksStore} from "@/stores/tasks.store"
import {highlightElement, scrollToElement} from "@/utils/ui/dom"
import BaseButton from "@/ui/base/BaseButton.vue"
import BaseIcon from "@/ui/base/BaseIcon"
import BaseSpinner from "@/ui/base/BaseSpinner.vue"

import {API} from "@/api"
import DeletedTaskItem from "./{fragments}/DeletedTaskItem.vue"

import type {Task} from "@shared/types/storage"

const tasksStore = useTasksStore()
const storageStore = useStorageStore()

const deletedTasks = ref<Task[]>([])
const isLoading = ref(false)
const isLoaded = ref(false)

async function loadDeletedTasks() {
  isLoading.value = true
  try {
    deletedTasks.value = await API.getDeletedTasks()
  } catch (error) {
    console.error("Failed to load deleted tasks", error)
    toast.error("Failed to load deleted tasks")
  } finally {
    isLoading.value = false
    isLoaded.value = true
  }
}

async function onRestore(task: Task) {
  const restoredTask = await API.restoreTask(task.id)

  if (restoredTask) {
    toast.success("Task restored successfully")
    await loadDeletedTasks()
    await tasksStore.revalidate()

    tasksStore.setActiveDay(restoredTask.scheduled.date)
    setTimeout(async () => {
      const scrolled = await scrollToElement(restoredTask.id)
      if (scrolled) highlightElement(restoredTask.id, {class: "highlight", duration: 2000})
    }, 100)
  } else {
    toast.error("Failed to restore task")
  }
}

async function onPermanentDelete(task: Task) {
  const contentPreview = task.content
    .replace(/[#*`\[\]]/g, "")
    .trim()
    .slice(0, 100)

  if (!confirm(`Permanently delete this task? This cannot be undone.\n\n"${contentPreview}..."`)) {
    return
  }

  const deleted = await API.permanentlyDeleteTask(task.id)

  if (deleted) {
    toast.success("Task permanently deleted")
    await loadDeletedTasks()
  } else {
    toast.error("Failed to permanently delete task")
  }
}

watch(
  () => storageStore.lastSyncAt,
  () => {
    if (isLoaded.value) {
      loadDeletedTasks()
    }
  },
)

onMounted(() => {
  loadDeletedTasks()
})
</script>

<template>
  <div class="flex h-full flex-col px-4 py-1.5">
    <div class="mb-3 flex items-center justify-between">
      <h3 class="text-base-content text-sm font-semibold">Deleted Tasks</h3>
      <BaseButton
        v-if="isLoaded && deletedTasks.length > 0"
        variant="ghost"
        size="sm"
        icon="refresh"
        tooltip="Refresh deleted tasks"
        class="text-base-content/60 hover:text-base-content"
        @click="loadDeletedTasks"
      />
    </div>

    <div v-if="isLoading" class="text-base-content/60 flex h-full flex-1 flex-col items-center justify-center gap-3">
      <BaseSpinner />
    </div>

    <div v-else-if="isLoaded && deletedTasks.length" class="flex flex-1 flex-col gap-1 overflow-y-auto px-1 py-1.5">
      <DeletedTaskItem v-for="task in deletedTasks" :key="task.id" :task="task" @restore="onRestore" @delete-permanently="onPermanentDelete" />
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
