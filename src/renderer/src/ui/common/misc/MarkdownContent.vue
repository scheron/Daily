<script setup lang="ts">
import {onMounted, ref, watch} from "vue"

import {createCodeSyntaxExtension} from "@/utils/codemirror/extensions/codeSyntax"
import {createMarkdownLanguageExtension} from "@/utils/codemirror/extensions/markdownLanguage"
import {createThemeExtension} from "@/utils/codemirror/extensions/theme"
import {createWYSIWYGExtension} from "@/utils/codemirror/extensions/wysiwyg"

import {EditorState} from "@codemirror/state"
import {EditorView} from "@codemirror/view"

const props = defineProps<{
  content: string
}>()

const container = ref<HTMLDivElement>()
let view: EditorView | null = null

function createReadonlyEditor(content: string) {
  if (!container.value) return

  if (view) view.destroy()

  const state = EditorState.create({
    doc: content,
    extensions: [
      createMarkdownLanguageExtension(),

      EditorView.lineWrapping,
      EditorView.editable.of(false),
      EditorState.readOnly.of(true),
      EditorView.contentAttributes.of({
        contenteditable: "false",
        tabindex: "-1",
      }),

      createThemeExtension(),
      createWYSIWYGExtension({readonly: true}),
      createCodeSyntaxExtension(),
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
  <div ref="container" class="markdown-view"></div>
</template>

<style scoped>
.markdown-view {
  width: 100%;
  overflow-x: auto;
  overflow-y: hidden;
}

.markdown-view :deep(.cm-editor) {
  background-color: transparent;
}

.markdown-view :deep(.cm-scroller) {
  overflow: visible;
}

.markdown-view :deep(.cm-content) {
  padding: 0;
}

/* Code blocks should not wrap and can extend beyond container width */
.markdown-view :deep(.cm-codeblock-line) {
  white-space: pre !important;
  overflow-x: visible !important;
}
</style>
