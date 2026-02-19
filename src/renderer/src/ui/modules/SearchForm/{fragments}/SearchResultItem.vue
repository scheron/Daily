<script setup lang="ts">
import {computed, onMounted, onUnmounted, useTemplateRef, watch} from "vue"

import {toFullDate} from "@shared/utils/date/formatters"
import {sortTags} from "@shared/utils/tags/sortTags"
import {createCodeSyntaxExtension} from "@/utils/codemirror/extensions/codeSyntax"
import {createMarkdownLanguageExtension} from "@/utils/codemirror/extensions/markdownLanguage"
import {createSearchHighlightExtension} from "@/utils/codemirror/extensions/searchHighlight"
import {createThemeExtension} from "@/utils/codemirror/extensions/theme"
import {createWYSIWYGExtension} from "@/utils/codemirror/extensions/wysiwyg"
import BaseIcon from "@/ui/base/BaseIcon"
import BaseTag from "@/ui/base/BaseTag.vue"

import {EditorState} from "@codemirror/state"
import {EditorView} from "@codemirror/view"

import type {TaskSearchResult} from "@shared/types/search"

const props = defineProps<{result: TaskSearchResult; searchQuery?: string}>()

const containerRef = useTemplateRef<HTMLDivElement>("container")
let view: EditorView | null = null

const statusIcon = computed(() => {
  if (props.result.task.status === "done") return "check-check"
  if (props.result.task.status === "discarded") return "archive"
  return "fire"
})

const statusColorClass = computed(() => {
  if (props.result.task.status === "done") return "text-success"
  if (props.result.task.status === "discarded") return "text-warning"
  return "text-error"
})

const sortedTags = computed(() => sortTags(props.result.task.tags))

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

watch(
  () => [props.result.task.content, props.result.matches],
  () => {
    createReadonlyEditor(props.result.task.content)
  },
  {immediate: true, deep: true},
)

onMounted(() => createReadonlyEditor(props.result.task.content))
onUnmounted(() => view?.destroy())
</script>

<template>
  <div class="hover:border-accent border-base-300 flex flex-col gap-2 rounded-lg border px-2 py-2 shadow-xs transition-colors duration-200">
    <div class="flex items-center justify-between gap-2">
      <span class="text-base-content/60 text-xs"> {{ toFullDate(result.task.scheduled.date) }} </span>
      <BaseIcon :name="statusIcon" class="size-4" :class="statusColorClass" />
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

/* Code blocks should not wrap and can extend beyond container width */
.search-result-content-viewer :deep(.cm-codeblock-line) {
  white-space: pre !important;
  overflow-x: visible !important;
}
</style>
