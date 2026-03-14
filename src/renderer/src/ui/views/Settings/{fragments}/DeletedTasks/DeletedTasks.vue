<script setup lang="ts">
import {ref} from "vue"
import {toasts} from "vue-toasts-lite"

import {useDeletedTasksStore} from "@/stores/deletedTasks.store"
import {useTasksStore} from "@/stores/tasks.store"
import {highlightElement, scrollToElement} from "@/utils/ui/dom"
import BaseButton from "@/ui/base/BaseButton.vue"
import BaseIcon from "@/ui/base/BaseIcon"
import ConfirmPopup from "@/ui/common/misc/ConfirmPopup.vue"

import {API} from "@/api"
import DeletedTaskItem from "./{fragments}/DeletedTaskItem.vue"

import type {Task} from "@shared/types/storage"

const tasksStore = useTasksStore()
const deletedTasksStore = useDeletedTasksStore()

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

  await deletedTasksStore.revalidate()
}

async function onDeleteAll() {
  if (!deletedTasksStore.deletedTasks.length || isDeletingAll.value) return

  isDeletingAll.value = true

  const deletedCount = await API.permanentlyDeleteAllDeletedTasks()
  if (deletedCount > 0) {
    toasts.success(`${deletedCount} task${deletedCount === 1 ? "" : "s"} permanently deleted`)
    await deletedTasksStore.revalidate()
  } else {
    toasts.error("Failed to permanently delete tasks")
  }

  isDeletingAll.value = false
}
</script>

<template>
  <div class="flex flex-1 flex-col gap-3">
    <div v-if="deletedTasksStore.deletedTasks.length" class="w-full">
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

    <div v-if="deletedTasksStore.deletedTasks.length" class="flex flex-1 flex-col gap-2 overflow-y-auto">
      <DeletedTaskItem v-for="task in deletedTasksStore.deletedTasks" :key="task.id" :task="task" @restore="onRestore" />
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
