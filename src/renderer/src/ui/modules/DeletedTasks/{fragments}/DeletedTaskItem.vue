<script setup lang="ts">
import {computed, onMounted, onUnmounted, useTemplateRef, watch} from "vue"

import {toFullDate} from "@shared/utils/date/formatters"
import {createCodeSyntaxExtension} from "@/utils/codemirror/extensions/codeSyntax"
import {createMarkdownLanguageExtension} from "@/utils/codemirror/extensions/markdownLanguage"
import {createThemeExtension} from "@/utils/codemirror/extensions/theme"
import {createWYSIWYGExtension} from "@/utils/codemirror/extensions/wysiwyg"
import BaseButton from "@/ui/base/BaseButton.vue"
import BaseIcon from "@/ui/base/BaseIcon"
import BaseTag from "@/ui/base/BaseTag.vue"

import {EditorState} from "@codemirror/state"
import {EditorView} from "@codemirror/view"

import type {Task} from "@shared/types/storage"

const props = defineProps<{task: Task}>()

const emit = defineEmits<{
  restore: [task: Task]
  deletePermanently: [task: Task]
}>()

const containerRef = useTemplateRef<HTMLDivElement>("container")
let view: EditorView | null = null

const statusIcon = computed(() => {
  if (props.task.status === "done") return "check-check"
  if (props.task.status === "discarded") return "archive"
  return "fire"
})

const statusColorClass = computed(() => {
  if (props.task.status === "done") return "text-success"
  if (props.task.status === "discarded") return "text-warning"
  return "text-error"
})

function createReadonlyEditor(content: string) {
  if (!containerRef.value) return

  if (view) view.destroy()

  const state = EditorState.create({
    doc: content,
    extensions: [
      createMarkdownLanguageExtension(),

      EditorView.lineWrapping,
      EditorView.editable.of(false),
      EditorState.readOnly.of(true),

      createThemeExtension(),
      createWYSIWYGExtension({readonly: true}),
      createCodeSyntaxExtension(),
      EditorView.theme({
        ".cm-cursor": {display: "none"},
        ".cm-content": {cursor: "default", fontSize: "10px", lineHeight: "1.4"},
        "&.cm-focused": {outline: "none"},
        ".cm-line": {fontSize: "10px"},
      }),
    ],
  })

  view = new EditorView({
    state,
    parent: containerRef.value,
  })
}

watch(
  () => [props.task.content],
  () => {
    createReadonlyEditor(props.task.content)
  },
  {immediate: true, deep: true},
)

onMounted(() => createReadonlyEditor(props.task.content))
onUnmounted(() => view?.destroy())

const deletedAtFormatted = computed(() => {
  if (!props.task.deletedAt) return ""
  return new Date(props.task.deletedAt).toLocaleDateString()
})
</script>

<template>
  <div class="border-base-300 flex flex-col gap-2 rounded-lg border px-2 py-2 shadow-xs transition-colors duration-200">
    <div class="flex items-center justify-between gap-2">
      <span class="text-base-content/60 text-xs">{{ toFullDate(task.scheduled.date) }}</span>
      <BaseIcon :name="statusIcon" class="size-4" :class="statusColorClass" />
    </div>

    <div class="text-base-content px-1 text-[10px]">
      <div ref="container" class="deleted-task-content-viewer"></div>
    </div>

    <div v-if="task.tags.length" class="flex flex-wrap gap-0.5">
      <BaseTag v-for="tag in task.tags" :key="tag.id" :selectable="false" :tag="tag" />
    </div>

    <div class="border-base-300 mt-1 border-t pt-2">
      <div class="mb-2 flex items-center justify-between">
        <span class="text-base-content/50 text-[10px]">Deleted: {{ deletedAtFormatted }}</span>
      </div>

      <div class="flex gap-1">
        <BaseButton
          variant="ghost"
          size="sm"
          icon="undo"
          tooltip="Restore task"
          class="text-success hover:bg-success/10 flex-1"
          @click="emit('restore', task)"
        >
          Restore
        </BaseButton>
        <BaseButton
          variant="ghost"
          size="sm"
          icon="trash"
          tooltip="Delete permanently"
          class="text-error hover:bg-error/10 flex-1"
          @click="emit('deletePermanently', task)"
        >
          Delete
        </BaseButton>
      </div>
    </div>
  </div>
</template>

<style scoped>
.deleted-task-content-viewer {
  width: 100%;
  overflow-x: auto;
  overflow-y: hidden;
}

.deleted-task-content-viewer :deep(.cm-editor) {
  background-color: transparent;
}

.deleted-task-content-viewer :deep(.cm-scroller) {
  overflow: visible;
}

.deleted-task-content-viewer :deep(.cm-content) {
  padding: 0;
}

.deleted-task-content-viewer :deep(.cm-codeblock-line) {
  white-space: pre !important;
  overflow-x: visible !important;
}
</style>
