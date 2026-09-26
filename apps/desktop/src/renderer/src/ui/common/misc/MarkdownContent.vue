<script setup lang="ts">
import {onMounted, ref, shallowRef, useTemplateRef, watch} from "vue"

import {useBatchedResizeObserver} from "@/composables/useBatchedResizeObserver"
import {useImagePreviewModal} from "@/ui/overlays/ImagePreviewModal"
import {renderMarkdownPreview} from "@/utils/codemirror/preview"
import {cn} from "@/utils/ui/tailwindcss"

const props = withDefaults(
  defineProps<{
    content: string
    /** Content taller than 200px is cut to `--task-content-minimized-height` behind a fade. Off when the content has to stay readable in full. */
    minimizable?: boolean
  }>(),
  {minimizable: true},
)

const containerRef = useTemplateRef<HTMLDivElement>("container")
const contentElementRef = shallowRef<HTMLElement | null>(null)
const shouldClamp = ref(false)

const {open: openImagePreview} = useImagePreviewModal()
useBatchedResizeObserver([() => (props.minimizable ? contentElementRef.value : null)], {read: readContentHeight, write: applyClamp})

function getMarkdownViewClasses(isMinimized: boolean) {
  return cn("markdown-view", isMinimized && "is-minimized")
}

function readContentHeight(): number {
  return contentElementRef.value?.scrollHeight ?? 0
}

function applyClamp(height: number) {
  shouldClamp.value = props.minimizable && height > 200
}

function renderPreview(content: string) {
  if (!containerRef.value) return

  const preview = renderMarkdownPreview(content, {isCompact: false})
  containerRef.value.replaceChildren(preview.element)
  contentElementRef.value = preview.element.querySelector(".cm-content")

  preview.languagesLoaded?.then(() => {
    if (props.content === content) renderPreview(content)
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
    renderPreview(newContent)
    applyClamp(readContentHeight())
  },
  {immediate: true},
)

onMounted(() => {
  renderPreview(props.content)
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
