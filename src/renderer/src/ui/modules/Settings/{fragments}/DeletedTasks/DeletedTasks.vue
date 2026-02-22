<script setup lang="ts">
import {onMounted, ref} from "vue"
import {toasts} from "vue-toasts-lite"

import {withElapsedDelay} from "@shared/utils/common/withElapsedDelay"
import {useStorageStore} from "@/stores/storage.store"
import {useTasksStore} from "@/stores/tasks.store"
import {useLoadingState} from "@/composables/useLoadingState"
import {highlightElement, scrollToElement} from "@/utils/ui/dom"
import BaseButton from "@/ui/base/BaseButton.vue"
import BaseIcon from "@/ui/base/BaseIcon"
import BaseSkeleton from "@/ui/base/BaseSkeleton.vue"
import ConfirmPopup from "@/ui/common/misc/ConfirmPopup.vue"

import {API} from "@/api"
import DeletedTaskItem from "./{fragments}/DeletedTaskItem.vue"

import type {Task} from "@shared/types/storage"

const tasksStore = useTasksStore()
const storageStore = useStorageStore()

const deletedTasks = ref<Task[]>([])
const {isLoading, isLoaded, setState} = useLoadingState("IDLE")
const isDeletingAll = ref(false)

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

async function onDeleteAll() {
  if (!deletedTasks.value.length || isDeletingAll.value) return

  isDeletingAll.value = true

  const deletedCount = await API.permanentlyDeleteAllDeletedTasks()
  if (deletedCount > 0) {
    toasts.success(`${deletedCount} task${deletedCount === 1 ? "" : "s"} permanently deleted`)
    deletedTasks.value = await API.getDeletedTasks()
  } else {
    toasts.error("Failed to permanently delete tasks")
  }

  isDeletingAll.value = false
}
</script>

<template>
  <div class="flex flex-1 flex-col gap-3">
    <div v-if="isLoaded && deletedTasks.length" class="w-full">
      <ConfirmPopup
        title="Delete all forever?"
        message="All deleted tasks will be removed permanently. This cannot be undone."
        cancel-text="Cancel"
        confirm-class="text-error hover:bg-error/10"
        confirm-text="Delete all"
        position="end"
        content-class="max-w-64"
        @confirm="onDeleteAll"
      >
        <template #trigger="{show}">
          <BaseButton
            variant="ghost"
            size="sm"
            icon="trash"
            class="text-error hover:bg-error/10 w-full"
            :loading="isDeletingAll"
            :disabled="isDeletingAll"
            @click="show()"
          >
            Delete All
          </BaseButton>
        </template>
      </ConfirmPopup>
    </div>

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
        <p class="text-xs">Will appear here</p>
      </div>
    </div>
  </div>
</template>
