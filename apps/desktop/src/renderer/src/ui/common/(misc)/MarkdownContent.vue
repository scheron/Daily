<script setup lang="ts">
import {computed, ref, toRef, useTemplateRef, watch} from "vue"

import {useBatchedResizeObserver} from "@/composables/useBatchedResizeObserver"
import {useMarkdownPreview} from "@/composables/useMarkdownPreview"
import {useImagePreviewModal} from "@/ui/overlays/ImagePreviewModal"
import {cn} from "@/utils/ui/tailwindcss"

const props = withDefaults(
  defineProps<{
    content: string
    /** Content taller than 200px is cut to `--task-content-minimized-height` behind a fade. Off when the content has to stay readable in full. */
    minimizable?: boolean
    /** Long lines of a code block are cut off instead of getting a scrollbar, so a horizontal gesture over the content reaches the container behind it. */
    clipCode?: boolean
  }>(),
  {minimizable: true, clipCode: false},
)

const containerRef = useTemplateRef<HTMLDivElement>("container")
const content = toRef(props, "content")
const minimizable = toRef(props, "minimizable")
const shouldClamp = ref(false)

const previewOptions = computed(() => ({isCompact: false, isCodeClipped: props.clipCode}))

const {open: openImagePreview} = useImagePreviewModal()
const contentElementRef = useMarkdownPreview(containerRef, content, previewOptions)
const observedContent = computed(() => (minimizable.value ? contentElementRef.value : null))
useBatchedResizeObserver([observedContent], {read: readContentHeight, write: applyClamp})

const markdownViewClass = computed(() => cn("markdown-view", {"is-minimized": shouldClamp.value}))

function readContentHeight(): number {
  return contentElementRef.value?.scrollHeight ?? 0
}

function applyClamp(height: number) {
  shouldClamp.value = props.minimizable && height > 200
}

function onContentClick(event: MouseEvent) {
  const target = event.target
  if (!(target instanceof Element)) return

  const image = target.closest("img")
  if (!(image instanceof HTMLImageElement)) return
  if (!containerRef.value?.contains(image)) return

  event.preventDefault()
  event.stopPropagation()
  openImagePreview(image.currentSrc || image.src, image.alt || "Image preview")
}

watch([contentElementRef, minimizable], () => applyClamp(readContentHeight()), {flush: "sync"})
</script>

<template>
  <div ref="container" :class="markdownViewClass" @click="onContentClick"></div>
</template>

<style scoped>
.markdown-view {
  width: 100%;
  overflow-x: auto;
  overflow-y: hidden;
}

.markdown-view :deep(.markdown-image img) {
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
</style>
