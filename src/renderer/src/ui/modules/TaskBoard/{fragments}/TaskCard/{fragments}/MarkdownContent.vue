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
import {useImagePreviewModal} from "@/ui/overlays/ImagePreviewModal"

import {EditorState} from "@codemirror/state"
import {EditorView} from "@codemirror/view"

const props = defineProps<{
  content: string
  minimized?: boolean
}>()
const emit = defineEmits<{
  "minimize-availability": [isAvailable: boolean]
}>()

const {open: openImagePreview} = useImagePreviewModal()

const container = ref<HTMLDivElement>()
const canMinimize = ref(false)
const shouldClamp = ref(false)
let view: EditorView | null = null

function measureClampState() {
  if (!container.value) {
    canMinimize.value = false
    shouldClamp.value = false
    emit("minimize-availability", false)
    return
  }

  const contentElement = container.value.querySelector(".cm-content") as HTMLElement | null
  const contentHeight = contentElement?.scrollHeight ?? 0

  const nextCanMinimize = contentHeight > TASK_CONTENT_MINIMIZED_HEIGHT
  canMinimize.value = nextCanMinimize
  shouldClamp.value = Boolean(props.minimized) && nextCanMinimize
  emit("minimize-availability", nextCanMinimize)
}

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
    parent: container.value,
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
  if (!container.value?.contains(image)) return

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

watch(
  () => props.minimized,
  () => {
    nextTick(() => {
      requestAnimationFrame(() => measureClampState())
    })
  },
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
  <div ref="container" class="markdown-view" :class="{'is-minimized': shouldClamp}" @click="onContentClick"></div>
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
