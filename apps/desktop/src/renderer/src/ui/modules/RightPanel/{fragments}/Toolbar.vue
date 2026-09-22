<script setup lang="ts">
import {toasts} from "vue-toasts-lite"

import {useCopyToClipboard} from "@/composables/useCopyToClipboard"
import BaseButton from "@/ui/base/BaseButton"
import {useTaskEditor} from "@/ui/modules/RightPanel/composables/useTaskEditor"
import TaskNavigator from "./TaskNavigator"

const {
  isEditing,
  canSave,
  activeTask,
  editingTaskId,
  isNew,
  flatOrderedTasks,
  currentIndex,
  canPrev,
  canNext,
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
</script>

<template>
  <div class="h-toolbar border-base-300 flex shrink-0 items-center justify-between border-b px-4">
    <div class="flex items-center gap-2" style="-webkit-app-region: no-drag">
      <BaseButton variant="ghost" icon="x-mark" tooltip="Close (Esc)" @click="close" />

      <TaskNavigator
        v-if="!(isNew || flatOrderedTasks.length <= 1)"
        :index="currentIndex"
        :total="flatOrderedTasks.length"
        :can-prev="canPrev"
        :can-next="canNext"
        @prev="navigatePrev"
        @next="navigateNext"
      />
    </div>

    <div class="flex items-center gap-1" style="-webkit-app-region: no-drag">
      <template v-if="isEditing">
        <BaseButton variant="ghost" :icon="isIdCopied ? 'check' : 'copy-id'" size="sm" tooltip="Copy Task ID" @click="copyTaskId" />
        <BaseButton variant="ghost" :icon="isContentCopied ? 'check' : 'copy'" size="sm" tooltip="Copy Task Content" @click="copyTaskContent" />
      </template>
      <BaseButton variant="primary-ghost" icon="check" size="sm" tooltip="Save (⌘S)" :disabled="!canSave" @click="commitDraftAndClose">
        Save
      </BaseButton>
    </div>
  </div>
</template>
