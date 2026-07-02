<script setup lang="ts">
import {nextTick, useTemplateRef, watch} from "vue"

import {useTaskEditor} from "../../composables/useTaskEditor"
import MarkdownEditor from "./{fragments}/MarkdownEditor.vue"

const editorRef = useTemplateRef<InstanceType<typeof MarkdownEditor>>("editorRef")

const {activeTask, localContent, isOpen, isNew, onBodyChange} = useTaskEditor()

watch(
  () => isOpen.value && isNew.value,
  async (isCreating) => {
    if (!isCreating) return
    await nextTick()
    editorRef.value?.focus()
  },
  {immediate: true},
)
</script>

<template>
  <MarkdownEditor
    v-if="activeTask"
    ref="editorRef"
    :task="activeTask"
    :content="localContent"
    class="min-h-0 flex-1 px-4 py-4"
    @update:content="onBodyChange"
  />
</template>
