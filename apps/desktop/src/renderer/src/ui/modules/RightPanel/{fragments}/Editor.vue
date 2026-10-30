<script setup lang="ts">
import {computed, nextTick, useTemplateRef, watch} from "vue"

import {useTaskEditorStore} from "@/stores/task-editor"
import MarkdownEditor from "@/ui/common/misc/MarkdownEditor"
import {useTaskEditor} from "@/ui/modules/RightPanel/composables/useTaskEditor"

const taskEditorStore = useTaskEditorStore()

const editorRef = useTemplateRef<InstanceType<typeof MarkdownEditor>>("editor")

const {activeTask, localContent, isOpen, isNew, onBodyChange} = useTaskEditor()

const isCreating = computed(() => isOpen.value && isNew.value)

function focusFromBlank(event: MouseEvent) {
  if (event.target === event.currentTarget) editorRef.value?.focus()
}

watch(
  isCreating,
  async (value) => {
    if (!value) return
    await nextTick()
    editorRef.value?.focus()
  },
  {immediate: true},
)
</script>

<template>
  <div v-if="activeTask" class="min-h-40 flex-1 cursor-text px-4 py-4" @click="focusFromBlank">
    <MarkdownEditor ref="editor" grow :task="activeTask" :content="localContent" @update:content="onBodyChange" @patch="taskEditorStore.patch" />
  </div>
</template>
