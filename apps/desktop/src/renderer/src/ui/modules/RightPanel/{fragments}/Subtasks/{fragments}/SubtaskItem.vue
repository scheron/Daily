<script setup lang="ts">
import {computed, nextTick, onBeforeUnmount, ref, useTemplateRef, watch} from "vue"

import BaseButton from "@/ui/base/BaseButton"
import BaseCheckbox from "@/ui/base/BaseCheckbox.vue"
import BaseInput from "@/ui/base/BaseInput.vue"
import {useSubtaskEditorOpen} from "@/ui/modules/RightPanel/composables/useSubtaskEditorOpen"
import {getTaskTitle} from "@/ui/modules/RightPanel/utils/getTaskTitle"
import ConfirmPopup from "@/ui/overlays/ConfirmPopup.vue"

import type {Subtask} from "@daily/protocol"

const props = defineProps<{subtask?: Subtask}>()

const emit = defineEmits<{
  setDone: [done: boolean]
  save: [content: string]
  cancel: []
  remove: []
  open: []
}>()

const isSubtaskEditorOpen = useSubtaskEditorOpen()
const inputRef = useTemplateRef<InstanceType<typeof BaseInput>>("input")

const isEditing = ref(!props.subtask)
const draft = ref("")

const firstLineIndex = computed(() => Math.max(0, props.subtask?.content.split("\n").findIndex((line) => line.trim()) ?? 0))
const title = computed(() => getTaskTitle(props.subtask?.content ?? ""))

function startEditing() {
  isEditing.value = true
}

function commit() {
  if (!isEditing.value) return
  isEditing.value = false
  const text = draft.value.trim()
  if (!text) return props.subtask ? undefined : emit("cancel")
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
  <div class="group flex min-h-8 items-center gap-2 px-4 py-1">
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
      @keydown.enter.prevent="commit"
      @keydown.esc.stop.prevent="cancel"
      @blur="commit"
    />

    <button v-else type="button" class="min-w-0 flex-1 cursor-text select-text truncate text-left text-sm" :title="title" @click="startEditing">
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
