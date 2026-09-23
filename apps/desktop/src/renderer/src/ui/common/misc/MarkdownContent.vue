<script setup lang="ts">
import {nextTick, onBeforeUnmount, onMounted, ref, useTemplateRef, watch} from "vue"

import {useImagePreviewModal} from "@/ui/overlays/ImagePreviewModal"
import {
  createCodeSyntaxExtension,
  createMarkdownLanguageExtension,
  createTablesExtension,
  createThemeExtension,
  createWYSIWYGExtension,
} from "@/utils/codemirror/extensions"
import {cn} from "@/utils/ui/tailwindcss"
import {EditorState} from "@codemirror/state"
import {EditorView} from "@codemirror/view"

const props = withDefaults(
  defineProps<{
    content: string
    /** Content taller than 200px is cut to `--task-content-minimized-height` behind a fade. Off when the content has to stay readable in full. */
    minimizable?: boolean
  }>(),
  {minimizable: true},
)

let view: EditorView | null = null

const containerRef = useTemplateRef<HTMLDivElement>("container")
const shouldClamp = ref(false)

const {open: openImagePreview} = useImagePreviewModal()

function getMarkdownViewClasses(isMinimized: boolean) {
  return cn("markdown-view", isMinimized && "is-minimized")
}

function measureClampState() {
  if (!props.minimizable || !containerRef.value) {
    shouldClamp.value = false
    return
  }

  const contentElement = containerRef.value.querySelector(".cm-content") as HTMLElement | null
  const contentHeight = contentElement?.scrollHeight ?? 0

  shouldClamp.value = contentHeight > 200
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
      EditorView.contentAttributes.of({
        contenteditable: "false",
        tabindex: "-1",
      }),

      createThemeExtension(),
      createWYSIWYGExtension({isReadonly: true}),
      createTablesExtension(),
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
    parent: containerRef.value,
  })

  nextTick(() => {
    requestAnimationFrame(() => measureClampState())
  })
}

function onContentClick(event: MouseEvent) {
  const target = event.target as HTMLElement | null
  if (!target) return

  const image = target.closest("img")
  if (!(image instanceof HTMLImageElement)) return
  if (!containerRef.value?.contains(image)) return

  event.preventDefault()
  event.stopPropagation()
  openImagePreview(image.currentSrc || image.src, image.alt || "Image preview")
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

onBeforeUnmount(() => {
  view?.destroy()
  view = null
})
</script>

<template>
  <div ref="container" :class="getMarkdownViewClasses(shouldClamp)" @click="onContentClick"></div>
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

.markdown-view :deep(.cm-codeblock-line) {
  white-space: pre !important;
  overflow-x: visible !important;
}

.markdown-view :deep(.cm-image-wrapper img) {
  cursor: zoom-in;
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

.markdown-view :deep(.cm-content) {
  min-width: 0;
}
</style>
