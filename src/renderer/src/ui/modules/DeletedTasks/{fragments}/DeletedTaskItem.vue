<script setup lang="ts">
import {computed, onMounted, onUnmounted, useTemplateRef, watch} from "vue"
import {toasts} from "vue-toasts-lite"

import {toFullDate} from "@shared/utils/date/formatters"
import {createCodeSyntaxExtension} from "@/utils/codemirror/extensions/codeSyntax"
import {createMarkdownLanguageExtension} from "@/utils/codemirror/extensions/markdownLanguage"
import {createThemeExtension} from "@/utils/codemirror/extensions/theme"
import {createWYSIWYGExtension} from "@/utils/codemirror/extensions/wysiwyg"
import BaseButton from "@/ui/base/BaseButton.vue"
import BaseIcon from "@/ui/base/BaseIcon"
import BaseTag from "@/ui/base/BaseTag.vue"
import ConfirmPopup from "@/ui/common/misc/ConfirmPopup.vue"

import {API} from "@/api"
import {EditorState} from "@codemirror/state"
import {EditorView} from "@codemirror/view"

import type {Task} from "@shared/types/storage"

const props = defineProps<{task: Task}>()
const emit = defineEmits<{restore: [task: Task]}>()

let view: EditorView | null = null

const containerRef = useTemplateRef<HTMLDivElement>("container")

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

async function onPermanentDelete(task: Task) {
  const deleted = await API.permanentlyDeleteTask(task.id)

  if (deleted) toasts.success("Task permanently deleted")
  else toasts.error("Failed to permanently delete task")
}

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
  <div class="border-base-300 flex flex-col gap-2 rounded-lg border px-4 py-2 shadow-xs transition-colors duration-200">
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

    <div class="mt-1 flex items-center justify-between gap-2 pt-2">
      <span class="text-base-content/50 text-xs">Deleted: {{ deletedAtFormatted }}</span>

      <div class="flex gap-1">
        <BaseButton variant="ghost" size="sm" icon="undo" class="text-success hover:bg-success/10 size-7" @click="emit('restore', task)" />

        <ConfirmPopup
          ref="confirmPopup"
          title="Delete task permanently?"
          message="This cannot be undone."
          cancel-text="Cancel"
          confirm-class="text-error hover:bg-error/10"
          confirm-text="Delete"
          position="center"
          @confirm="onPermanentDelete(task)"
        >
          <template #trigger="{show}">
            <BaseButton variant="ghost" size="sm" icon="trash" class="text-error hover:bg-error/10 size-7" icon-class="size-4" @click="show()" />
          </template>
        </ConfirmPopup>
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
