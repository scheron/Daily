<script setup lang="ts">
import {toasts} from "vue-toasts-lite"

import {useCopyToClipboard} from "@/composables/useCopyToClipboard"
import {useTasksStore} from "@/stores/tasks"
import BaseButton from "@/ui/base/BaseButton"
import {useTaskEditor} from "@/ui/modules/RightPanel/composables/useTaskEditor"
import ConfirmPopup from "@/ui/overlays/ConfirmPopup.vue"
import TaskNavigator from "./{fragments}/TaskNavigator"

const tasksStore = useTasksStore()

const {isEditing, activeTask, editingTaskId, isNew, flatOrderedTasks, currentIndex, canPrev, canNext, close, navigatePrev, navigateNext} =
  useTaskEditor()

const {copyToClipboard: runCopyId, isCopied: isIdCopied} = useCopyToClipboard({onSuccess: () => toasts.success("Task ID copied to clipboard")})
const {copyToClipboard: runCopyContent, isCopied: isContentCopied} = useCopyToClipboard({
  onSuccess: () => toasts.success("Task content copied to clipboard"),
})

function copyTaskId() {
  if (!editingTaskId.value) return
  runCopyId(editingTaskId.value)
}

function copyTaskContent() {
  if (!activeTask.value) return
  runCopyContent(activeTask.value.content)
}

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
    <TaskNavigator
      v-if="!(isNew || flatOrderedTasks.length <= 1)"
      :index="currentIndex"
      :total="flatOrderedTasks.length"
      :can-prev="canPrev"
      :can-next="canNext"
      @prev="navigatePrev"
      @next="navigateNext"
    />

    <div aria-hidden="true" class="flex-1 self-stretch" />

    <div class="flex items-center gap-0.5">
      <BaseButton variant="ghost" :icon="isIdCopied ? 'check' : 'copy-id'" size="sm" tooltip="Copy Task ID" @click="copyTaskId" />
      <BaseButton variant="ghost" :icon="isContentCopied ? 'check' : 'copy'" size="sm" tooltip="Copy Task Content" @click="copyTaskContent" />

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
  </div>
</template>
