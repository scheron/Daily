<script setup lang="ts">
import {ref} from "vue"
import {toasts} from "vue-toasts-lite"

import {API} from "@/api"
import BaseButton from "@/ui/base/BaseButton"
import BaseIcon from "@/ui/base/BaseIcon"
import ConfirmPopup from "@/ui/overlays/ConfirmPopup.vue"
import DeletedTaskItem from "./{fragments}/DeletedTaskItem.vue"
import {useDeletedTasks} from "./useDeletedTasks"

import type {Task} from "@daily/protocol"

const isDeletingAll = ref(false)

const {deletedTasks, revalidate} = useDeletedTasks()

async function onRestore(task: Task) {
  try {
    const changeset = await API.restoreTask(task.id)
    const restoredTask = changeset.tasks?.upserted?.find((t) => t.id === task.id)

    if (restoredTask) toasts.success("Task restored successfully")
    else toasts.error("Failed to restore task")
  } catch (error) {
    console.error("Failed to restore task", error)
    toasts.error("Failed to restore task")
  }

  await revalidate()
}

async function onDeleteAll() {
  if (!deletedTasks.value.length || isDeletingAll.value) return

  isDeletingAll.value = true

  const deletedCount = await API.permanentlyDeleteAllDeletedTasks()
  if (deletedCount > 0) {
    toasts.success(`${deletedCount} task${deletedCount === 1 ? "" : "s"} permanently deleted`)
    await revalidate()
  } else {
    toasts.error("Failed to permanently delete tasks")
  }

  isDeletingAll.value = false
}
</script>

<template>
  <div class="flex flex-1 flex-col gap-3">
    <div v-if="deletedTasks.length" class="w-full">
      <ConfirmPopup
        title="Delete all forever?"
        message="All deleted tasks will be removed permanently. This cannot be undone."
        cancel-text="Cancel"
        confirm-text="Delete all"
        position="end"
        content-class="max-w-64"
        @confirm="onDeleteAll"
      >
        <template #trigger="{show}">
          <BaseButton
            variant="ghost"
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

    <div v-if="deletedTasks.length" class="flex flex-1 flex-col gap-2 overflow-y-auto">
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
