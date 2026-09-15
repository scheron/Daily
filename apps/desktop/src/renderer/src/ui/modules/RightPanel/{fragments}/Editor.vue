<script setup lang="ts">
import {computed, nextTick, useTemplateRef, watch} from "vue"

import MarkdownEditor from "@/ui/common/misc/MarkdownEditor"
import {useTaskEditor} from "@/ui/modules/RightPanel/composables/useTaskEditor"

const editorRef = useTemplateRef<InstanceType<typeof MarkdownEditor>>("editor")

const {activeTask, localContent, isOpen, isNew, onBodyChange} = useTaskEditor()

const isCreating = computed(() => isOpen.value && isNew.value)

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
  <MarkdownEditor
    v-if="activeTask"
    ref="editor"
    :task="activeTask"
    :content="localContent"
    class="min-h-0 flex-1 px-4 py-4"
    @update:content="onBodyChange"
  />
</template>
