<script setup lang="ts">
import {onBeforeUnmount, onMounted, ref, useTemplateRef} from "vue"
import {useEventListener} from "@vueuse/core"

import BaseButton from "@/ui/base/BaseButton"
import MarkdownEditor from "@/ui/common/misc/MarkdownEditor"
import {useSubtaskEditorOpen} from "@/ui/modules/RightPanel/composables/useSubtaskEditorOpen"
import {SHORTCUTS_MAP} from "@shared/constants/shortcuts"
import {acceleratorsMatch} from "@shared/utils/shortcuts/acceleratorsMatch"
import {formatEventToAccelerator} from "@shared/utils/shortcuts/formatEventToAccelerator"

const props = defineProps<{content?: string; saving?: boolean}>()

const emit = defineEmits<{
  save: [string]
  cancel: []
}>()

const draft = ref(props.content ?? "")

const isSubtaskEditorOpen = useSubtaskEditorOpen()

const editorRef = useTemplateRef<InstanceType<typeof MarkdownEditor>>("editor")

function save() {
  if (props.saving) return
  const content = draft.value.trim()
  if (content && content !== props.content) emit("save", content)
  else emit("cancel")
}

function cancel(): boolean {
  if (editorRef.value?.isCompletionOpen()) return false
  if (!props.saving) emit("cancel")
  return true
}

function onKeydown(event: KeyboardEvent) {
  const pressed = formatEventToAccelerator(event)
  if (!pressed) return

  if (acceleratorsMatch(pressed, SHORTCUTS_MAP["subtasks:cancel"].accelerator)) {
    if (!cancel()) return
  } else if (acceleratorsMatch(pressed, SHORTCUTS_MAP["subtasks:submit"].accelerator)) save()
  else return

  event.stopPropagation()
  event.preventDefault()
}

useEventListener(window, "keydown", (event: KeyboardEvent) => {
  if (event.defaultPrevented) return
  const pressed = formatEventToAccelerator(event)
  if (!pressed || !acceleratorsMatch(pressed, SHORTCUTS_MAP["subtasks:cancel"].accelerator) || !cancel()) return
  event.preventDefault()
})

onMounted(() => {
  isSubtaskEditorOpen.value = true
  editorRef.value?.focus()
})

onBeforeUnmount(() => (isSubtaskEditorOpen.value = false))
</script>

<template>
  <div class="flex min-h-0 flex-1 flex-col" @keydown.capture="onKeydown">
    <MarkdownEditor
      ref="editor"
      v-model:content="draft"
      attachments
      :readonly="saving"
      placeholder="Write a subtask…"
      class="min-h-0 flex-1 px-4 py-4"
    />

    <div class="flex shrink-0 items-center justify-end gap-2 px-4 pb-3">
      <BaseButton variant="text" size="sm" :aria-disabled="saving || undefined" @click="!saving && emit('cancel')">Cancel</BaseButton>
      <BaseButton variant="primary" size="sm" @click="save">Save</BaseButton>
    </div>
  </div>
</template>
