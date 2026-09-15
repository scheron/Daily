<script setup lang="ts">
import {computed, onMounted, onUnmounted, useTemplateRef, watch} from "vue"

import {sortTags} from "@daily/protocol"
import {toDateLabel} from "@daily/std"

import BaseIcon from "@/ui/base/BaseIcon"
import BaseTag from "@/ui/base/BaseTag"
import {
  createCodeSyntaxExtension,
  createMarkdownLanguageExtension,
  createSearchHighlightExtension,
  createTablesExtension,
  createThemeExtension,
  createWYSIWYGExtension,
} from "@/utils/codemirror/extensions"
import {cn} from "@/utils/ui/tailwindcss"
import {EditorState} from "@codemirror/state"
import {EditorView} from "@codemirror/view"

import type {TaskSearchResult, TaskStatus} from "@daily/protocol"

const props = defineProps<{result: TaskSearchResult}>()

let view: EditorView | null = null

const containerRef = useTemplateRef<HTMLDivElement>("container")

const statusIcon = computed(() => {
  if (props.result.task.status === "done") return "check-check"
  if (props.result.task.status === "discarded") return "archive"
  if (props.result.task.status === "backlog") return "bookmark"
  return "fire"
})

const sortedTags = computed(() => sortTags(props.result.task.tags))
const branchName = computed(() => props.result.branch?.name ?? "Main")

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
      createWYSIWYGExtension({isReadonly: true}),
      createTablesExtension(),
      createCodeSyntaxExtension(),
      createSearchHighlightExtension(props.result.matches),
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

function getStatusIconClasses(status: TaskStatus) {
  return cn(
    "size-4",
    {
      done: "text-success",
      discarded: "text-warning",
      backlog: "text-base-content/70",
      active: "text-error",
    }[status],
  )
}

watch(
  () => [props.result.task.content, props.result.matches],
  () => {
    createReadonlyEditor(props.result.task.content)
  },
  {deep: true},
)

onMounted(() => createReadonlyEditor(props.result.task.content))
onUnmounted(() => view?.destroy())
</script>

<template>
  <div class="hover:border-accent border-base-300 flex flex-col gap-2 rounded-lg border px-2 py-2 shadow-xs transition-colors duration-200">
    <div class="flex items-center justify-between gap-2">
      <div class="flex items-center gap-1.5">
        <span class="text-base-content/60 text-xs"> {{ result.task.scheduled ? toDateLabel(result.task.scheduled.date) : "No date" }} </span>
        <span class="bg-base-300 text-base-content/70 rounded px-1.5 py-0.5 text-[9px] font-medium">{{ branchName }}</span>
      </div>
      <BaseIcon :name="statusIcon" :class="getStatusIconClasses(result.task.status)" />
    </div>

    <div class="text-base-content px-1 text-[10px]">
      <div ref="container" class="search-result-content-viewer"></div>
    </div>

    <div v-if="sortedTags.length" class="flex flex-wrap gap-0.5">
      <BaseTag v-for="tag in sortedTags" :key="tag.id" :selectable="false" :tag="tag" />
    </div>
  </div>
</template>

<style scoped>
.search-result-content-viewer {
  width: 100%;
  overflow-x: auto;
  overflow-y: hidden;
}

.search-result-content-viewer :deep(.cm-editor) {
  background-color: transparent;
}

.search-result-content-viewer :deep(.cm-scroller) {
  overflow: visible;
}

.search-result-content-viewer :deep(.cm-content) {
  padding: 0;
}

.search-result-content-viewer :deep(.cm-codeblock-line) {
  white-space: pre !important;
  overflow-x: visible !important;
}
</style>
