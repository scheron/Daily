<script setup lang="ts">
import {computed, nextTick, onMounted, toRef, useTemplateRef} from "vue"

import {useTaskEditorStore} from "@/stores/task-editor"
import BaseButton from "@/ui/base/BaseButton"
import BaseCheckbox from "@/ui/base/BaseCheckbox.vue"
import MarkdownEditor from "@/ui/common/misc/MarkdownEditor"
import {openedSubtaskId} from "@/ui/modules/RightPanel/composables/useSubtaskEditorOpen"
import {useTaskEditor} from "@/ui/modules/RightPanel/composables/useTaskEditor"
import {getTaskTitle} from "@/ui/modules/RightPanel/utils/getTaskTitle"
import ConfirmPopup from "@/ui/overlays/ConfirmPopup.vue"
import {useConfirmUnsavedModal} from "@/ui/overlays/ConfirmUnsavedModal"
import {useSubtaskWrite} from "./useSubtaskWrite"

import type {Subtask} from "@daily/protocol"

const props = defineProps<{subtaskId: Subtask["id"]}>()

const taskEditorStore = useTaskEditorStore()
const {localContent} = useTaskEditor()
const {content, subtask, onContentChange, flush, toggleDone, remove, startMakeTask} = useSubtaskWrite(toRef(props, "subtaskId"))
const {open: confirmLeaveIfDirty} = useConfirmUnsavedModal()

const editorRef = useTemplateRef<InstanceType<typeof MarkdownEditor>>("editor")

const parentTitle = computed(() => getTaskTitle(localContent.value) || "Task")

function back() {
  void flush()
  openedSubtaskId.value = null
}

async function onDelete() {
  if (await remove()) openedSubtaskId.value = null
}

async function onMakeTask() {
  if (!(await flush())) return
  if (!(await confirmLeaveIfDirty())) return
  const task = await startMakeTask()
  if (!task) return
  openedSubtaskId.value = null
  await taskEditorStore.open(task.id)
}

onMounted(async () => {
  await nextTick()
  editorRef.value?.focus()
})
</script>

<template>
  <div class="flex min-h-0 flex-1 flex-col">
    <div class="h-toolbar flex shrink-0 items-center gap-2 px-4" style="-webkit-app-region: no-drag">
      <BaseButton class="min-w-0 shrink" variant="ghost" icon="chevron-left" size="sm" tooltip="Back (Esc)" @click="back">
        <span class="truncate">{{ parentTitle }}</span>
      </BaseButton>

      <div aria-hidden="true" class="flex-1" />

      <div class="flex shrink-0 items-center gap-0.5">
        <BaseButton v-if="!taskEditorStore.isNew" variant="ghost" size="sm" @click="onMakeTask">Make a task</BaseButton>

        <ConfirmPopup
          title="Delete subtask?"
          message="This subtask will be removed."
          confirm-text="Delete"
          cancel-text="Cancel"
          position="end"
          content-class="max-w-64"
          @confirm="onDelete"
        >
          <template #trigger="{show}">
            <BaseButton variant="error-ghost" icon="trash" size="sm" tooltip="Delete" @click="show" />
          </template>
        </ConfirmPopup>
      </div>
    </div>

    <div class="min-h-0 flex-1 overflow-y-auto">
      <div class="flex min-h-full flex-col">
        <label class="flex items-center gap-2 px-4 py-2 text-sm">
          <BaseCheckbox :model-value="subtask?.done ?? false" class="size-4 rounded-full" @click.prevent="toggleDone" />
          Done
        </label>

        <div class="min-h-40 flex-1 cursor-text px-4 py-4">
          <MarkdownEditor ref="editor" grow attachments :content="content" @update:content="onContentChange" />
        </div>
      </div>
    </div>
  </div>
</template>
