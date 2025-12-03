<script setup lang="ts">
import {onMounted, ref, watch} from "vue"

import {createCodeSyntaxExtension, createMarkdownLanguageExtension, createThemeExtension, createWYSIWYGExtension} from "@/composables/codemirror"

import {EditorState} from "@codemirror/state"
import {EditorView} from "@codemirror/view"

const props = defineProps<{
  content: string
}>()

const container = ref<HTMLDivElement>()
let view: EditorView | null = null

function createReadonlyEditor(content: string) {
  if (!container.value) return

  // Destroy existing view if any
  if (view) {
    view.destroy()
  }

  // Create readonly CodeMirror instance
  const state = EditorState.create({
    doc: content,
    extensions: [
      // Markdown language support with GFM (task lists, strikethrough, tables)
      createMarkdownLanguageExtension(),

      // Line wrapping (no horizontal scroll)
      EditorView.lineWrapping,

      // Make editor readonly
      EditorView.editable.of(false),
      EditorState.readOnly.of(true),

      // Theme
      createThemeExtension(),

      // WYSIWYG rendering (always show, ignore cursor position)
      createWYSIWYGExtension({readonly: true}),

      // Code syntax highlighting
      createCodeSyntaxExtension(),

      // Disable cursor
      EditorView.theme({
        ".cm-cursor": {display: "none"},
        ".cm-content": {cursor: "default"},
        "&.cm-focused": {outline: "none"},
      }),
    ],
  })

  view = new EditorView({
    state,
    parent: container.value,
  })
}

// Watch for content changes
watch(
  () => props.content,
  (newContent) => {
    createReadonlyEditor(newContent)
  },
  {immediate: true},
)

onMounted(() => {
  createReadonlyEditor(props.content)
})
</script>

<template>
  <div ref="container" class="task-content-viewer"></div>
</template>

<style scoped>
.task-content-viewer {
  width: 100%;
  overflow-x: auto; /* Allow horizontal scroll for wide code blocks */
  overflow-y: hidden;
}

.task-content-viewer :deep(.cm-editor) {
  background-color: transparent;
}

.task-content-viewer :deep(.cm-scroller) {
  overflow: visible;
}

.task-content-viewer :deep(.cm-content) {
  padding: 0;
}

/* Code blocks should not wrap and can extend beyond container width */
.task-content-viewer :deep(.cm-codeblock-line) {
  white-space: pre !important;
  overflow-x: visible !important;
}
</style>
