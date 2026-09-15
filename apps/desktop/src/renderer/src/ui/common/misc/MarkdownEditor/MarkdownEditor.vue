<script setup lang="ts">
import {onBeforeUnmount, onMounted, ref, shallowRef, useTemplateRef, watch} from "vue"

import {useTagsStore} from "@/stores/tags.store"
import {useTaskEditorStore} from "@/stores/task-editor"
import {useImagePreviewModal} from "@/ui/overlays/ImagePreviewModal"
import {markdownKeymap} from "@/utils/codemirror/commands"
import {
  createAutoPairsExtension,
  createCodeSyntaxExtension,
  createCompletionExtension,
  createCompletionNavigationExtension,
  createMarkdownLanguageExtension,
  createMarkdownListIndentExtension,
  createOrderedListRenumberExtension,
  createTablesExtension,
  createThemeExtension,
  createWYSIWYGExtension,
  skipOrderedListRenumber,
} from "@/utils/codemirror/extensions"
import {cn} from "@/utils/ui/tailwindcss"
import {defaultKeymap, history, historyKeymap, indentWithTab} from "@codemirror/commands"
import {EditorState, Prec} from "@codemirror/state"
import {drawSelection, EditorView, keymap, placeholder} from "@codemirror/view"
import {useClipboardPaste} from "./composables/useClipboardPaste"
import {useFileDrop} from "./composables/useFileDrop"
import FloatingToolbar from "./{fragments}/FloatingToolbar"

import type {Tag, Task} from "@daily/protocol"

const props = defineProps<{content: string; task?: Task}>()
const emit = defineEmits<{"update:content": [value: string]}>()

const tagsStore = useTagsStore()
const taskEditorStore = useTaskEditorStore()

const containerRef = useTemplateRef<HTMLDivElement>("container")

const view = shallowRef<EditorView | null>(null)

const {open: openImagePreview} = useImagePreviewModal()

if (props.task) {
  useClipboardPaste(containerRef, view)
}

const {isDraggingOver} = props.task ? useFileDrop(containerRef, view) : {isDraggingOver: ref(false)}

function getContainerClasses(isDraggingOver: boolean) {
  return cn("markdown-editor relative size-full", isDraggingOver && "ring-offset-base-100 ring-accent/50 rounded-md ring-2")
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

function addTaskTag(tag: Tag) {
  if (!props.task) return
  if (props.task.tags.some((t) => t.id === tag.id)) return
  taskEditorStore.patch({tags: [...props.task.tags, tag]})
}

function removeTaskTag(tag: Tag) {
  if (!props.task) return
  if (!props.task.tags.some((t) => t.id === tag.id)) return
  taskEditorStore.patch({tags: props.task.tags.filter((t) => t.id !== tag.id)})
}

function createEditor(initialContent: string) {
  if (!containerRef.value) return
  if (view.value) view.value.destroy()

  const state = EditorState.create({
    doc: initialContent,
    extensions: [
      history(),
      drawSelection(),
      createMarkdownLanguageExtension(),
      createMarkdownListIndentExtension(),
      createOrderedListRenumberExtension(),
      placeholder("Type / for commands"),
      EditorView.lineWrapping,
      EditorView.updateListener.of((update) => {
        if (update.docChanged) emit("update:content", update.state.doc.toString())
      }),
      createThemeExtension(),
      createWYSIWYGExtension({isReadonly: false}),
      createTablesExtension(),
      createCodeSyntaxExtension(),
      Prec.high(keymap.of(markdownKeymap)),
      createAutoPairsExtension(),
      keymap.of([...defaultKeymap, ...historyKeymap]),
      createCompletionExtension(
        props.task
          ? {
              getTags: () => tagsStore.tagsForBranch(props.task!.branchId),
              getAttachedTags: () => props.task!.tags,
              onAddTag: addTaskTag,
              onRemoveTag: removeTaskTag,
            }
          : undefined,
      ),
      createCompletionNavigationExtension(),
      Prec.low(keymap.of([indentWithTab])),
    ],
  })

  view.value = new EditorView({state, parent: containerRef.value})
}

watch(
  () => props.content,
  (next) => {
    if (!view.value) return
    if (next === view.value.state.doc.toString()) return
    view.value.dispatch({
      changes: {from: 0, to: view.value.state.doc.length, insert: next},
      annotations: skipOrderedListRenumber.of(true),
    })
  },
)

onMounted(() => createEditor(props.content))
onBeforeUnmount(() => view.value?.destroy())

defineExpose({
  focus: () => view.value?.focus(),
})
</script>

<template>
  <div ref="container" :class="getContainerClasses(isDraggingOver)" @click="onContentClick">
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
