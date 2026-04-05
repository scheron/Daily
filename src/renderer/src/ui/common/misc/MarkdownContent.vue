<script setup lang="ts">
import {computed, nextTick, onMounted, ref, watch} from "vue"

import {TASK_CONTENT_MINIMIZED_HEIGHT} from "@/constants/ui"
import {createCodeSyntaxExtension} from "@/utils/codemirror/extensions/codeSyntax"
import {createMarkdownLanguageExtension} from "@/utils/codemirror/extensions/markdownLanguage"
import {createThemeExtension} from "@/utils/codemirror/extensions/theme"
import {createWYSIWYGExtension} from "@/utils/codemirror/extensions/wysiwyg"
import BaseButton from "@/ui/base/BaseButton.vue"
import BaseModal from "@/ui/base/BaseModal.vue"

import {EditorState} from "@codemirror/state"
import {EditorView} from "@codemirror/view"

const props = defineProps<{
  content: string
  minimized?: boolean
}>()
const emit = defineEmits<{
  "minimize-availability": [isAvailable: boolean]
}>()

const container = ref<HTMLDivElement>()
const canMinimize = ref(false)
const shouldClamp = ref(false)
const previewImageSrc = ref<string | null>(null)
const previewImageAlt = ref("")
const isCopied = ref(false)
let view: EditorView | null = null
const isImagePreviewOpen = computed(() => Boolean(previewImageSrc.value))

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
  previewImageSrc.value = image.currentSrc || image.src
  previewImageAlt.value = image.alt || "Image preview"
}

function closeImagePreview() {
  previewImageSrc.value = null
  previewImageAlt.value = ""
  isCopied.value = false
}

async function copyImageToClipboard(event: MouseEvent) {
  const button = event.currentTarget as HTMLElement
  const img = button.parentElement?.querySelector("img")
  if (!img) return

  try {
    const canvas = document.createElement("canvas")
    canvas.width = img.naturalWidth
    canvas.height = img.naturalHeight
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    ctx.drawImage(img, 0, 0)

    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"))
    if (!blob) return

    await navigator.clipboard.write([new ClipboardItem({"image/png": blob})])

    isCopied.value = true
    setTimeout(() => {
      isCopied.value = false
    }, 2000)
  } catch (error) {
    console.error("Failed to copy image to clipboard:", error)
  }
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
</script>

<template>
  <div ref="container" class="markdown-view" :class="{'is-minimized': shouldClamp}" @click="onContentClick"></div>

  <BaseModal
    :open="isImagePreviewOpen"
    hide-header
    container-class="h-auto max-h-[90vh] w-fit max-w-5xl"
    content-class="!p-0"
    @close="closeImagePreview"
  >
    <div class="relative flex h-full w-full items-center justify-center p-3 md:p-4">
      <img v-if="previewImageSrc" :src="previewImageSrc" :alt="previewImageAlt" class="max-h-[80vh] max-w-full rounded-md object-contain" />

      <BaseButton
        variant="secondary"
        size="sm"
        :icon="isCopied ? 'check' : 'copy'"
        icon-class="size-3.5"
        class="absolute right-5 bottom-5"
        @click="copyImageToClipboard"
      >
        {{ isCopied ? "Copied" : "Copy" }}
      </BaseButton>
    </div>
  </BaseModal>
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
</style>
