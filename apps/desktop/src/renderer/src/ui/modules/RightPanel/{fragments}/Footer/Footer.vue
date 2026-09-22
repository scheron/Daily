<script setup lang="ts">
import {toasts} from "vue-toasts-lite"

import {useTasksStore} from "@/stores/tasks"
import BaseButton from "@/ui/base/BaseButton"
import {useTaskEditor} from "@/ui/modules/RightPanel/composables/useTaskEditor"
import ConfirmPopup from "@/ui/overlays/ConfirmPopup.vue"

const tasksStore = useTasksStore()

const {isEditing, activeTask, editingTaskId, close} = useTaskEditor()

async function onDelete() {
  if (!editingTaskId.value) return
  const deleted = await tasksStore.deleteTask(editingTaskId.value)
  if (deleted) {
    toasts.success("Task deleted")
    close()
  }
}
</script>

<template>
  <div v-if="activeTask && isEditing" class="border-base-300 text-base-content/60 flex h-10 items-center border-t px-4">
    <div aria-hidden="true" class="flex-1 self-stretch" />

    <ConfirmPopup
      title="Delete task?"
      message="This task will be moved to trash."
      confirm-text="Delete"
      cancel-text="Cancel"
      position="end"
      content-class="max-w-72"
      @confirm="onDelete"
    >
      <template #trigger="{show}">
        <BaseButton variant="error-ghost" icon="trash" size="sm" @click="show" />
      </template>
    </ConfirmPopup>
  </div>
</template>
