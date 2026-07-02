<script setup lang="ts">
import {toasts} from "vue-toasts-lite"

import {useCopyToClipboard} from "@/composables/useCopyToClipboard"
import BaseButton from "@/ui/base/BaseButton"
import {useTaskEditor} from "@/ui/modules/RightPanel/composables/useTaskEditor"

const {isEditing, canSave, activeTask, editingTaskId, close, commitDraftAndClose} = useTaskEditor()

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
  <div class="h-toolbar border-base-300 compact:pl-traffic-light compact:drag-region flex shrink-0 items-center justify-between border-b px-4">
    <BaseButton variant="ghost" icon="x-mark" tooltip="Close (Esc)" size="sm" style="-webkit-app-region: no-drag" @click="close" />

    <div class="flex items-center gap-1" style="-webkit-app-region: no-drag">
      <template v-if="isEditing">
        <BaseButton
          variant="ghost"
          :icon="isIdCopied ? 'check' : 'copy-id'"
          icon-class="size-4.5"
          size="sm"
          tooltip="Copy Task ID"
          @click="copyTaskId"
        />
        <BaseButton
          variant="ghost"
          :icon="isContentCopied ? 'check' : 'copy'"
          icon-class="size-4.5"
          size="sm"
          tooltip="Copy Task Content"
          @click="copyTaskContent"
        />
      </template>
      <BaseButton
        variant="primary-ghost"
        icon="check"
        size="sm"
        tooltip="Save (⌘S)"
        class="px-3 py-1"
        :disabled="!canSave"
        @click="commitDraftAndClose"
      >
        Save
      </BaseButton>
    </div>
  </div>
</template>
