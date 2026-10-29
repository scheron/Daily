<script setup lang="ts">
import {computed} from "vue"

import {toRelativeTime} from "@daily/std"

import {TASK_COLUMNS} from "@/constants/ui"
import BaseButton from "@/ui/base/BaseButton"
import BaseSegmented from "@/ui/base/BaseSegmented.vue"
import MarkdownContent from "@/ui/common/misc/MarkdownContent.vue"
import ConfirmPopup from "@/ui/overlays/ConfirmPopup.vue"
import {cn} from "@/utils/ui/tailwindcss"

import type {Subtask, TaskStatus} from "@daily/protocol"

const props = defineProps<{subtask: Subtask}>()

const emit = defineEmits<{
  setDone: [done: boolean]
  edit: []
  makeTask: []
  remove: []
}>()

const doneOptions = [
  {value: "todo" as const, label: "To do", ...getColumn("in_progress")},
  {value: "done" as const, label: "Done", ...getColumn("done")},
]

const status = computed({
  get: () => (props.subtask.done ? "done" : "todo"),
  set: (value) => emit("setDone", value === "done"),
})

const title = computed(() =>
  props.subtask.content
    .trim()
    .split("\n")[0]
    .replace(/^#+\s*/, ""),
)

function getColumn(status: TaskStatus) {
  const {icon, counterClass} = TASK_COLUMNS.find((column) => column.status === status)!
  return {icon, activeClass: counterClass}
}

function getRowClasses(done: boolean) {
  return cn(
    "group border px-4 pt-2 pb-2.5",
    done ? "border-success/30 hover:border-success/40 rounded-2xl" : "border-transparent border-b-base-300/60 rounded-none",
  )
}
</script>

<template>
  <div :class="getRowClasses(subtask.done)">
    <div class="flex min-h-6 items-center gap-1.5">
      <span class="text-base-content/40 text-xs">{{ toRelativeTime(subtask.createdAt) }}</span>

      <BaseSegmented v-model="status" :options="doneOptions" :aria-label="`Status of ${title}`" class="ml-auto" />

      <div class="flex gap-0.5 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
        <BaseButton variant="ghost-muted" icon="external-link" size="xs" tooltip="Make a task" @click="emit('makeTask')" />
        <BaseButton variant="ghost-muted" icon="pencil" size="xs" tooltip="Edit" @click="emit('edit')" />

        <ConfirmPopup
          title="Delete subtask?"
          message="This subtask will be removed."
          confirm-text="Delete"
          cancel-text="Cancel"
          position="end"
          content-class="max-w-64"
          @confirm="emit('remove')"
        >
          <template #trigger="{show}">
            <BaseButton variant="error-ghost" icon="trash" size="xs" tooltip="Delete" @click="show" />
          </template>
        </ConfirmPopup>
      </div>
    </div>

    <MarkdownContent :content="subtask.content" :minimizable="false" class="subtask-markdown mt-0.5 select-text" />
  </div>
</template>

<style scoped>
.subtask-markdown :deep(.cm-heading) {
  margin-top: 0.25rem;
  margin-bottom: 0.1rem;
}

.subtask-markdown :deep(.cm-heading1),
.subtask-markdown :deep(.cm-heading2) {
  font-size: 1.15em !important;
  margin: 0.25rem 0 0.1rem !important;
  padding-bottom: 0 !important;
}
</style>
