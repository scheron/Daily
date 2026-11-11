<script setup lang="ts">
import {computed, nextTick, onBeforeUnmount, ref, useTemplateRef, watch} from "vue"

import BaseButton from "@/ui/base/BaseButton"
import BaseCheckbox from "@/ui/base/BaseCheckbox.vue"
import BaseInput from "@/ui/base/BaseInput.vue"
import {useSubtaskEditorOpen} from "@/ui/modules/RightPanel/composables/useSubtaskEditorOpen"
import {getTaskTitle} from "@/ui/modules/RightPanel/utils/getTaskTitle"
import ConfirmPopup from "@/ui/overlays/ConfirmPopup.vue"
import {cn} from "@/utils/ui/tailwindcss"

import type {Subtask} from "@daily/protocol"

const props = defineProps<{subtask?: Subtask}>()

const emit = defineEmits<{
  setDone: [done: boolean]
  save: [content: string]
  saveAndContinue: [content: string]
  cancel: []
  remove: []
  open: []
}>()

const inputRef = useTemplateRef<InstanceType<typeof BaseInput>>("input")
const isEditing = ref(!props.subtask)
const draft = ref("")

const firstLineIndex = computed(() => Math.max(0, props.subtask?.content.split("\n").findIndex((line) => line.trim()) ?? 0))
const title = computed(() => getTaskTitle(props.subtask?.content ?? ""))

const isSubtaskEditorOpen = useSubtaskEditorOpen()

const rowClass = computed(() => cn("group flex min-h-8 items-center gap-2 px-4 py-1", {"border-base-content/10 border-b": Boolean(props.subtask)}))

function startEditing() {
  isEditing.value = true
}

function commit(keepAdding = false) {
  if (!isEditing.value) return
  const text = draft.value.trim()
  if (!props.subtask && keepAdding && text) {
    draft.value = ""
    emit("saveAndContinue", text)
    return
  }

  isEditing.value = false
  if (!text) {
    if (!props.subtask) emit("cancel")
    return
  }
  if (!props.subtask) return emit("save", text)
  const lines = props.subtask.content.split("\n")
  if (lines[firstLineIndex.value].trim() === text) return
  lines[firstLineIndex.value] = text
  emit("save", lines.join("\n"))
}

function cancel() {
  if (!isEditing.value) return
  isEditing.value = false
  if (!props.subtask) emit("cancel")
}

watch(
  isEditing,
  async (editing) => {
    isSubtaskEditorOpen.value = editing
    if (!editing) return
    draft.value = props.subtask?.content.split("\n")[firstLineIndex.value].trim() ?? ""
    await nextTick()
    inputRef.value?.focus()
  },
  {immediate: true},
)

onBeforeUnmount(() => (isSubtaskEditorOpen.value = false))
</script>

<template>
  <div :class="rowClass">
    <BaseCheckbox
      :model-value="subtask?.done ?? false"
      :aria-label="`Done: ${title}`"
      class="size-4 shrink-0 rounded-full"
      @click="subtask && emit('setDone', !subtask.done)"
    />

    <BaseInput
      v-if="isEditing"
      ref="input"
      v-model="draft"
      bare
      hide-outline
      placeholder="New subtask"
      class="min-w-0 flex-1 text-sm"
      @keydown.enter.prevent="commit(true)"
      @keydown.esc.stop.prevent="cancel"
      @blur="commit()"
    />

    <button v-else v-tooltip="title" type="button" class="min-w-0 flex-1 cursor-text select-text truncate text-left text-sm" @click="startEditing">
      {{ title }}
    </button>

    <div v-if="subtask && !isEditing" class="flex gap-0.5 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
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

      <BaseButton variant="ghost-muted" icon="chevron-right" size="xs" tooltip="Open subtask" @click="emit('open')" />
    </div>
  </div>
</template>
