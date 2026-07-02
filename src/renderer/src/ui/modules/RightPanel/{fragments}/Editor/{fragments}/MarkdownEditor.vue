<script setup lang="ts">
import {onBeforeUnmount, onMounted, shallowRef, useTemplateRef, watch} from "vue"
import {toasts} from "vue-toasts-lite"

import {useTagsStore} from "@/stores/tags.store"
import {useTaskEditorStore} from "@/stores/task-editor"
import {useClipboardPaste} from "@/composables/useClipboardPaste"
import {useFileDrop} from "@/composables/useFileDrop"
import {markdownKeymap} from "@/utils/codemirror/commands"
import {
  createCodeSyntaxExtension,
  createCompletionExtension,
  createMarkdownLanguageExtension,
  createMarkdownListIndentExtension,
  createTablesExtension,
  createThemeExtension,
  createWYSIWYGExtension,
} from "@/utils/codemirror/extensions"
import {useImagePreviewModal} from "@/ui/overlays/ImagePreviewModal"

import {defaultKeymap, history, historyKeymap, indentWithTab} from "@codemirror/commands"
import {EditorState, Prec} from "@codemirror/state"
import {drawSelection, EditorView, keymap, placeholder} from "@codemirror/view"
import {useImageUpload} from "../composables/useImageUpload"
import FloatingToolbar from "./FloatingToolbar.vue"

import type {Tag, Task} from "@shared/types/storage"

const props = defineProps<{content: string; task: Task}>()
const emit = defineEmits<{"update:content": [value: string]}>()

const tagsStore = useTagsStore()
const taskEditorStore = useTaskEditorStore()

const container = useTemplateRef<HTMLDivElement>("container")

const view = shallowRef<EditorView | null>(null)

const {open: openImagePreview} = useImagePreviewModal()
const {uploadImageFile} = useImageUpload()

useClipboardPaste(container, {
  onImagePaste: async (file) => {
    const md = await uploadImageFile(file)
    if (md) insertText(md)
  },
})

const {isDraggingOver} = useFileDrop(container, {
  onFileDrop: async (file) => {
    const md = await uploadImageFile(file)
    if (md) insertText(md)
  },
  onRejectedFile: (file) => {
    toasts.error(`Only image files are supported. "${file.name}" is not an image.`)
  },
})

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

function addTaskTag(tag: Tag) {
  if (props.task.tags.some((t) => t.id === tag.id)) return
  taskEditorStore.patch({tags: [...props.task.tags, tag]})
}

function removeTaskTag(tag: Tag) {
  if (!props.task.tags.some((t) => t.id === tag.id)) return
  taskEditorStore.patch({tags: props.task.tags.filter((t) => t.id !== tag.id)})
}

function insertText(text: string) {
  if (!view.value) return
  const {from, to} = view.value.state.selection.main
  view.value.dispatch({
    changes: {from, to, insert: text},
    selection: {anchor: from + text.length},
  })
  view.value.focus()
}

function createEditor(initialContent: string) {
  if (!container.value) return
  if (view.value) view.value.destroy()

  const state = EditorState.create({
    doc: initialContent,
    extensions: [
      history(),
      drawSelection(),
      createMarkdownLanguageExtension(),
      createMarkdownListIndentExtension(),
      placeholder("Write something…"),
      EditorView.lineWrapping,
      EditorView.updateListener.of((update) => {
        if (update.docChanged) emit("update:content", update.state.doc.toString())
      }),
      createThemeExtension(),
      createWYSIWYGExtension({readonly: false}),
      createTablesExtension(),
      createCodeSyntaxExtension(),
      Prec.high(keymap.of(markdownKeymap)),
      keymap.of([...defaultKeymap, ...historyKeymap]),
      createCompletionExtension({
        getTags: () => tagsStore.tags,
        getAttachedTags: () => props.task.tags,
        onAddTag: addTaskTag,
        onRemoveTag: removeTaskTag,
      }),
      Prec.low(keymap.of([indentWithTab])),
    ],
  })

  view.value = new EditorView({state, parent: container.value})
}

watch(
  () => props.content,
  (next) => {
    if (!view.value) return
    if (next === view.value.state.doc.toString()) return
    view.value.dispatch({changes: {from: 0, to: view.value.state.doc.length, insert: next}})
  },
)

onMounted(() => createEditor(props.content))
onBeforeUnmount(() => view.value?.destroy())

defineExpose({
  focus: () => view.value?.focus(),
})
</script>

<template>
  <div
    ref="container"
    class="markdown-editor relative size-full"
    :class="{'ring-offset-base-100 ring-accent/50 rounded-md ring-2': isDraggingOver}"
    @click="onContentClick"
  >
    <FloatingToolbar v-if="view" :editor-view="view" />
  </div>
</template>

<style scoped>
.markdown-editor :deep(.cm-editor) {
  background: transparent;
  outline: none;
  height: 100%;
}
.markdown-editor :deep(.cm-content) {
  padding: 0;
  caret-color: var(--color-accent);
}
.markdown-editor :deep(.cm-line) {
  padding-inline: 0;
}
.markdown-editor :deep(.cm-focused) {
  outline: none;
}
.markdown-editor :deep(.cm-scroller) {
  overflow: auto;
}
.markdown-editor :deep(.cm-image-wrapper img) {
  cursor: zoom-in;
}

.markdown-editor :deep(.cm-content) {
  min-width: 0;
}
</style>
