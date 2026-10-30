<script setup lang="ts">
import {toasts} from "vue-toasts-lite"

import {useCopyToClipboard} from "@/composables/useCopyToClipboard"
import {useTasksStore} from "@/stores/tasks"
import BaseButton from "@/ui/base/BaseButton"
import {useTaskEditor} from "@/ui/modules/RightPanel/composables/useTaskEditor"
import ConfirmPopup from "@/ui/overlays/ConfirmPopup.vue"
import TaskNavigator from "./TaskNavigator"

defineProps<{title: string}>()

const tasksStore = useTasksStore()

const {
  activeTask,
  editingTaskId,
  isEditing,
  flatOrderedTasks,
  currentIndex,
  canPrev,
  canNext,
  canSave,
  close,
  commitDraftAndClose,
  navigatePrev,
  navigateNext,
} = useTaskEditor()

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
  <div class="h-toolbar flex shrink-0 items-center gap-2 px-4" style="-webkit-app-region: no-drag">
    <BaseButton class="shrink-0" variant="ghost" icon="x-mark" tooltip="Close (Esc)" @click="close" />

    <TaskNavigator
      v-if="isEditing && flatOrderedTasks.length > 1"
      class="shrink-0"
      :index="currentIndex"
      :total="flatOrderedTasks.length"
      :can-prev="canPrev"
      :can-next="canNext"
      @prev="navigatePrev"
      @next="navigateNext"
    />

    <span v-if="title" v-tooltip="title" class="min-w-0 flex-1 truncate text-sm font-semibold">{{ title }}</span>
    <div v-else aria-hidden="true" class="flex-1" />

    <div class="flex shrink-0 items-center gap-0.5">
      <template v-if="isEditing">
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

        <div aria-hidden="true" class="bg-base-300 mx-1.5 h-4 w-px" />
      </template>

      <BaseButton variant="primary-ghost" icon="check" size="sm" tooltip="Save (⌘S)" :disabled="!canSave" @click="commitDraftAndClose">
        Save
      </BaseButton>
    </div>
  </div>
</template>
