<script setup lang="ts">
import {nextTick, onBeforeUnmount, onMounted, ref, watch} from "vue"

import {TASK_CONTENT_MINIMIZED_HEIGHT} from "@/constants/ui"
import {
  createCodeSyntaxExtension,
  createMarkdownLanguageExtension,
  createTablesExtension,
  createThemeExtension,
  createWYSIWYGExtension,
} from "@/utils/codemirror/extensions"

import {EditorState} from "@codemirror/state"
import {EditorView} from "@codemirror/view"

const props = defineProps<{
  content: string
  minimized?: boolean
}>()

const container = ref<HTMLDivElement>()
const shouldClamp = ref(false)
let view: EditorView | null = null

function measureClampState() {
  const contentElement = container.value?.querySelector(".cm-content") as HTMLElement | null
  shouldClamp.value = Boolean(props.minimized) && (contentElement?.scrollHeight ?? 0) > TASK_CONTENT_MINIMIZED_HEIGHT
}

function createReadonlyEditor(content: string) {
  if (!container.value) return

  view?.destroy()

  const state = EditorState.create({
    doc: content,
    extensions: [
      createMarkdownLanguageExtension(),
      EditorView.lineWrapping,
      EditorView.editable.of(false),
      EditorState.readOnly.of(true),
      EditorView.contentAttributes.of({contenteditable: "false", tabindex: "-1"}),
      createThemeExtension(),
      createWYSIWYGExtension({readonly: true}),
      createTablesExtension(),
      createCodeSyntaxExtension(),
      EditorView.theme({
        ".cm-cursor": {display: "none"},
        ".cm-content": {cursor: "default"},
        "&.cm-focused": {outline: "none"},
      }),
    ],
  })

  view = new EditorView({state, parent: container.value})

  nextTick(() => {
    requestAnimationFrame(measureClampState)
  })
}

watch(() => props.content, createReadonlyEditor, {immediate: true})

watch(
  () => props.minimized,
  () => {
    nextTick(() => {
      requestAnimationFrame(measureClampState)
    })
  },
)

onMounted(() => createReadonlyEditor(props.content))

onBeforeUnmount(() => {
  view?.destroy()
  view = null
})
</script>

<template>
  <div ref="container" class="markdown-view" :class="{'is-minimized': shouldClamp}"></div>
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
  min-width: 0;
  padding: 0;
}

.markdown-view :deep(.cm-codeblock-line) {
  white-space: pre !important;
  overflow-x: visible !important;
}

.markdown-view.is-minimized {
  position: relative;
  max-height: var(--task-content-minimized-height);
  overflow: hidden;
}

.markdown-view.is-minimized::after {
  content: "";
  pointer-events: none;
  position: absolute;
  inset-inline: 0;
  bottom: 0;
  height: 24px;
  background: linear-gradient(to bottom, transparent, var(--color-base-100));
}

.markdown-view.is-minimized :deep(.cm-editor) {
  max-height: var(--task-content-minimized-height);
}

.markdown-view.is-minimized :deep(.cm-scroller) {
  overflow: hidden;
}
</style>
