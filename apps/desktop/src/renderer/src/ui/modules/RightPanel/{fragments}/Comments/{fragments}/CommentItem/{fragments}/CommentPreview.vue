<script setup lang="ts">
import {computed, onBeforeUnmount, onMounted, ref, useTemplateRef} from "vue"

import MarkdownContent from "@/ui/common/misc/MarkdownContent.vue"
import {cn} from "@/utils/ui/tailwindcss"

type RenderedLine = {top: number; bottom: number}

defineProps<{content: string}>()
const emit = defineEmits<{"clip-focus": []}>()

let frame = 0
let disposed = false
let resizeObserver: ResizeObserver | null = null
let mutationObserver: MutationObserver | null = null
let measuredContent: HTMLElement | null = null
let fonts: FontFaceSet | undefined
const clippedElements = new Set<HTMLElement>()

const viewportRef = useTemplateRef<HTMLDivElement>("viewport")
const renderedRef = useTemplateRef<HTMLDivElement>("rendered")
const clip = ref<{height: number; fadeHeight: number} | null>(null)

const previewStyle = computed(() =>
  clip.value ? {maxHeight: `${clip.value.height}px`, "--comment-fade-height": `${clip.value.fadeHeight}px`} : undefined,
)

function getViewportClasses(isClipped: boolean) {
  return cn("comment-preview", isClipped && "is-clipped")
}

function queueMeasurement() {
  if (disposed || frame) return
  frame = requestAnimationFrame(() => {
    frame = 0
    measure()
  })
}

function measure() {
  const viewport = viewportRef.value
  const content = renderedRef.value?.querySelector<HTMLElement>(".cm-content") ?? null
  if (content !== measuredContent) {
    if (measuredContent) resizeObserver?.unobserve(measuredContent)
    measuredContent = content
    if (content) resizeObserver?.observe(content)
  }
  if (!viewport || !content || viewport.getBoundingClientRect().width === 0) {
    clip.value = null
    syncFocusability(content, null)
    return
  }

  const lines = readLines(content)
  const last = lines[5]
  if (lines.length <= 6 || !last) {
    clip.value = null
    syncFocusability(content, null)
    return
  }

  const height = Math.ceil(last.bottom - viewport.getBoundingClientRect().top)
  const fadeHeight = Math.ceil(last.bottom - last.top)
  if (clip.value?.height !== height || clip.value.fadeHeight !== fadeHeight) clip.value = {height, fadeHeight}
  syncFocusability(content, viewport.getBoundingClientRect().top + height)
}

function syncFocusability(content: HTMLElement | null, cutoff: number | null) {
  for (const element of clippedElements) {
    if (!content?.contains(element) || cutoff === null) {
      element.removeAttribute("inert")
      clippedElements.delete(element)
    }
  }
  if (!content || cutoff === null) return

  const top = viewportRef.value!.getBoundingClientRect().top
  for (const element of Array.from(
    content.querySelectorAll<HTMLElement>("a[href], button, input, select, textarea, [tabindex], [contenteditable=true]"),
  )) {
    const rectangles = Array.from(element.getClientRects())
    if (!rectangles.length) rectangles.push(element.getBoundingClientRect())
    const isVisible = rectangles.some((rect) => rect.width > 0 && rect.height > 0 && rect.bottom > top && rect.top < cutoff)
    if (isVisible) {
      if (clippedElements.delete(element)) element.removeAttribute("inert")
    } else {
      if (element.contains(document.activeElement)) emit("clip-focus")
      if (!element.hasAttribute("inert")) {
        element.setAttribute("inert", "")
        clippedElements.add(element)
      }
    }
  }
}

function readLines(content: HTMLElement): RenderedLine[] {
  const rectangles: RenderedLine[] = []
  const walker = document.createTreeWalker(content, NodeFilter.SHOW_TEXT)
  const range = document.createRange()
  let node: Node | null
  while ((node = walker.nextNode())) {
    const parent = node.parentElement
    if (!parent || !node.textContent?.length || parent.closest("button, .cm-image-wrapper, .cm-table")) continue
    range.selectNodeContents(node)
    const lineHeight = Number.parseFloat(getComputedStyle(parent).lineHeight)
    for (const rect of Array.from(range.getClientRects())) {
      if (rect.height <= 0 || rect.width <= 0) continue
      const leading = Number.isFinite(lineHeight) ? Math.max(0, lineHeight - rect.height) / 2 : 0
      rectangles.push({top: rect.top - leading, bottom: rect.bottom + leading})
    }
  }

  for (const element of Array.from(
    content.querySelectorAll<HTMLElement>(".cm-image-wrapper, .cm-table tr, .cm-hr, .cm-line, .cm-codeblock-text-line"),
  )) {
    const isEmptyLine =
      element.matches(".cm-line, .cm-codeblock-text-line") && !element.textContent && !element.querySelector("img, .cm-image-wrapper")
    if (!isEmptyLine && !element.matches(".cm-image-wrapper, .cm-table tr, .cm-hr")) continue
    const rect = element.getBoundingClientRect()
    if (rect.height > 0 && rect.width > 0) rectangles.push({top: rect.top, bottom: rect.bottom})
  }

  const lines: RenderedLine[] = []
  for (const rect of rectangles.sort((a, b) => a.top - b.top)) {
    const previous = lines.at(-1)
    const overlap = previous ? Math.min(previous.bottom, rect.bottom) - Math.max(previous.top, rect.top) : 0
    if (previous && overlap > Math.min(previous.bottom - previous.top, rect.bottom - rect.top) / 2) {
      previous.top = Math.min(previous.top, rect.top)
      previous.bottom = Math.max(previous.bottom, rect.bottom)
    } else lines.push({...rect})
  }
  return lines
}

onMounted(() => {
  resizeObserver = new ResizeObserver(queueMeasurement)
  if (viewportRef.value) resizeObserver.observe(viewportRef.value)
  mutationObserver = new MutationObserver((records) => {
    if (records.some((record) => record.type !== "attributes" || record.attributeName !== "inert")) queueMeasurement()
  })
  if (renderedRef.value) mutationObserver.observe(renderedRef.value, {subtree: true, childList: true, characterData: true, attributes: true})
  fonts = document.fonts
  fonts?.ready.then(queueMeasurement)
  fonts?.addEventListener("loadingdone", queueMeasurement)
  queueMeasurement()
})

onBeforeUnmount(() => {
  disposed = true
  cancelAnimationFrame(frame)
  resizeObserver?.disconnect()
  mutationObserver?.disconnect()
  fonts?.removeEventListener("loadingdone", queueMeasurement)
})
</script>

<template>
  <div ref="viewport" :class="getViewportClasses(clip !== null)" :style="previewStyle">
    <div ref="rendered" @load.capture="queueMeasurement" @error.capture="queueMeasurement">
      <MarkdownContent :content="content" :minimizable="false" />
    </div>
  </div>
</template>

<style scoped>
.comment-preview {
  position: relative;
}

.comment-preview.is-clipped {
  overflow: clip;
}

.comment-preview.is-clipped::after {
  content: "";
  position: absolute;
  inset-inline: 0;
  bottom: 0;
  height: var(--comment-fade-height);
  background: linear-gradient(to bottom, transparent, var(--color-base-100));
  pointer-events: none;
}
</style>
