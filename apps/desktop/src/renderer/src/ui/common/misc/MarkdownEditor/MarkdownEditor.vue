<script setup lang="ts">
import {computed, onBeforeUnmount, onMounted, ref, shallowRef, useTemplateRef, watch} from "vue"
import {useEventListener} from "@vueuse/core"

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
import {acceptCompletion, completionStatus, currentCompletions, setSelectedCompletion} from "@codemirror/autocomplete"
import {defaultKeymap, history, historyKeymap, indentWithTab} from "@codemirror/commands"
import {EditorState, Prec} from "@codemirror/state"
import {drawSelection, EditorView, keymap, placeholder} from "@codemirror/view"
import {useClipboardPaste} from "./composables/useClipboardPaste"
import {useFileDrop} from "./composables/useFileDrop"
import {useTaskSlashCommands} from "./composables/useTaskSlashCommands"
import FloatingToolbar from "./{fragments}/FloatingToolbar"

import type {TaskDraft} from "@/types/taskDraft"
import type {Task} from "@daily/protocol"
import type {QuickCaptureMenu} from "@shared/types/quickCapture"

const props = defineProps<{
  content: string
  /** The task whose properties the `/` commands edit; without it only block commands are offered. */
  task?: Task
  /** Hides the editor's own `/` menu and reports it through `menu` instead, for a host that draws it elsewhere. */
  externalMenu?: boolean
  /** Turns off image paste and drop, for a host that has nowhere to keep attachments. */
  noAttachments?: boolean
  /** Keeps the editor at least this many lines tall, empty or not. A line is `1.5em` unless the host sets `--editor-line-height`. */
  minLines?: number
}>()
const emit = defineEmits<{
  "update:content": [value: string]
  patch: [updates: Partial<TaskDraft>]
  menu: [menu: QuickCaptureMenu | null]
}>()

const containerRef = useTemplateRef<HTMLDivElement>("container")

const view = shallowRef<EditorView | null>(null)

const {open: openImagePreview} = useImagePreviewModal()

if (props.task && !props.noAttachments) {
  useClipboardPaste(containerRef, view)
}

const {isDraggingOver} = props.task && !props.noAttachments ? useFileDrop(containerRef, view) : {isDraggingOver: ref(false)}

useEventListener(
  containerRef,
  "dragover",
  (event: DragEvent) => {
    if (props.noAttachments && event.dataTransfer?.types.includes("Files")) event.preventDefault()
  },
  {capture: true},
)

useEventListener(
  containerRef,
  "drop",
  (event: DragEvent) => {
    if (!props.noAttachments || !event.dataTransfer?.files.length) return
    event.preventDefault()
    event.stopPropagation()
  },
  {capture: true},
)

const taskCommands = props.task
  ? useTaskSlashCommands(
      computed(() => props.task!),
      (updates) => emit("patch", updates),
    )
  : undefined

function getContainerClasses(isDraggingOver: boolean) {
  return cn(
    "markdown-editor relative size-full",
    props.minLines && "has-min-lines",
    isDraggingOver && "ring-offset-base-100 ring-accent/50 rounded-md ring-2",
  )
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

function createEditor(initialContent: string) {
  if (!containerRef.value) return
  if (view.value) view.value.destroy()

  view.value = new EditorView({state: createState(initialContent), parent: containerRef.value})
}

function createState(doc: string) {
  return EditorState.create({
    doc,
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
      createCompletionExtension(taskCommands, props.externalMenu ? (menu) => emit("menu", menu) : undefined),
      createCompletionNavigationExtension(),
      Prec.low(keymap.of([indentWithTab])),
    ],
  })
}

function pickCompletion(index: number) {
  const editor = view.value
  if (!editor || completionStatus(editor.state) !== "active") return
  if (!Number.isInteger(index) || index < 0 || index >= currentCompletions(editor.state).length) return

  editor.dispatch({effects: setSelectedCompletion(index)})
  acceptCompletion(editor)
  editor.focus()
}

function resetHistory() {
  if (view.value) view.value.setState(createState(view.value.state.doc.toString()))
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
  resetHistory,
  pickCompletion,
})
</script>

<template>
  <div
    ref="container"
    :class="getContainerClasses(isDraggingOver)"
    :style="minLines ? {'--editor-min-lines': minLines} : undefined"
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
.markdown-editor :deep(.cm-line:not(.cm-codeblock-line)) {
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
.markdown-editor.has-min-lines :deep(.cm-content) {
  min-height: calc(var(--editor-min-lines) * var(--editor-line-height, 1.5em));
}
</style>
