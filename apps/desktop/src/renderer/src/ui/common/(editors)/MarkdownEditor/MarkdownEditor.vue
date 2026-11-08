<script setup lang="ts">
import {computed, onBeforeUnmount, onMounted, ref, shallowRef, useTemplateRef, watch} from "vue"

import SlashCommandRows from "@/ui/common/(misc)/SlashCommandRows"
import {useImagePreviewModal} from "@/ui/overlays/ImagePreviewModal"
import {cn} from "@/utils/ui/tailwindcss"
import {autoUpdate, flip, offset, shift, useFloating} from "@floating-ui/vue"
import {Editor, EditorContent} from "@tiptap/vue-3"
import {useEditorAttachments} from "./composables/useEditorAttachments"
import {useSlashMenu} from "./composables/useSlashMenu"
import {useTaskSlashCommands} from "./composables/useTaskSlashCommands"
import {createDailyMarkdownExtensions} from "./utils/createDailyMarkdownExtensions"
import {createEditorInput} from "./utils/createEditorInput"
import EditLinkDialog from "./{fragments}/EditLinkDialog.vue"
import FloatingToolbar from "./{fragments}/FloatingToolbar.vue"

import type {TaskDraft} from "@/types/taskDraft"
import type {Task} from "@daily/protocol"
import type {QuickTaskMenu} from "@shared/types/quickTask"

const props = withDefaults(
  defineProps<{
    content: string
    /** The task whose properties the `/` commands edit. */
    task?: Task
    /** Reports the slash menu for a host that draws it in a separate window. */
    externalMenu?: boolean
    /** Image paste and drop. Defaults to on with a task. False swallows file drops. */
    attachments?: boolean
    minLines?: number
    placeholder?: string
    /** Grows with its content and lets the host scroll. */
    grow?: boolean
    readonly?: boolean
  }>(),
  {attachments: undefined},
)
const emit = defineEmits<{
  "update:content": [value: string]
  patch: [updates: Partial<TaskDraft>]
  menu: [menu: QuickTaskMenu | null]
}>()

let lastMarkdown = props.content

const containerRef = useTemplateRef<HTMLDivElement>("container")
const slashPanelRef = useTemplateRef<HTMLDivElement>("slashPanel")
const editor = shallowRef<Editor | null>(null)
const linkDialogOpen = ref(false)
const isEmpty = ref(!props.content)

const attachmentsEnabled = computed(() => props.attachments ?? !!props.task)
const attachmentsDisabled = computed(() => props.attachments === false)
const readonly = computed(() => !!props.readonly)
const taskId = computed(() => props.task?.id)
const task = computed(() => props.task!)

const {open: openImagePreview} = useImagePreviewModal()
const {isDraggingOver} = useEditorAttachments(containerRef, editor, {
  enabled: attachmentsEnabled,
  disabled: attachmentsDisabled,
  readonly,
  contentKey: taskId,
})
const taskCommands = props.task ? useTaskSlashCommands(task, (patch) => emit("patch", patch)).commands : []
const {extension: slashExtension, menu: slashMenu, getAnchor, pick, dismiss} = useSlashMenu(taskCommands, linkDialogOpen)

const slashReference = computed(() =>
  editor.value && slashMenu.value ? {contextElement: editor.value.view.dom, getBoundingClientRect: getAnchor} : null,
)
const {floatingStyles} = useFloating(slashReference, slashPanelRef, {
  placement: "bottom-start",
  middleware: [offset(6), flip(), shift({padding: 8})],
  whileElementsMounted: autoUpdate,
})

const containerClass = computed(() =>
  cn("markdown-editor relative", [props.grow ? "is-grow w-full" : "size-full"], {
    "has-min-lines": props.minLines,
    "ring-offset-base-100 ring-accent/50 rounded-md ring-2": isDraggingOver.value,
  }),
)

function openLinkDialog() {
  if (!props.readonly && editor.value) linkDialogOpen.value = true
}

function closeLinkDialog() {
  linkDialogOpen.value = false
  editor.value?.commands.focus()
}

function onContentClick(event: MouseEvent) {
  if (!(event.target instanceof Element)) return

  const image = event.target.closest("img[src]")
  if (image instanceof HTMLImageElement) {
    event.preventDefault()
    event.stopPropagation()
    openImagePreview(image.currentSrc || image.src, image.alt || "Image preview")
    return
  }

  const link = event.target.closest("a[href]")
  if (!(link instanceof HTMLAnchorElement)) return
  event.preventDefault()
  if (!link.getAttribute("href")) return
  if (event.metaKey || event.ctrlKey || props.readonly) {
    event.stopPropagation()
    void window.BridgeIPC["shell:open-external"](link.href)
  }
}

function replaceEditor(markdown: string) {
  const previous = editor.value
  const refocus = previous?.isFocused
  if (previous) {
    dismiss(previous)
    previous.destroy()
  }

  lastMarkdown = markdown
  linkDialogOpen.value = false

  const instance = new Editor({
    content: markdown,
    contentType: "markdown",
    editable: !props.readonly,
    autofocus: refocus ? "start" : false,
    extensions: [...createDailyMarkdownExtensions(), slashExtension],
    editorProps: {
      ...createEditorInput(editor),
      attributes: {role: "textbox", "aria-label": "Markdown editor", "aria-multiline": "true"},
    },
    onUpdate({editor: current, transaction}) {
      if (!transaction.docChanged) return

      isEmpty.value = current.isEmpty
      const next = current.state.doc.eq(originalDoc) ? markdown : current.getMarkdown()
      if (next === lastMarkdown) return
      lastMarkdown = next
      emit("update:content", next)
    },
    onBlur({editor: current}) {
      dismiss(current)
    },
  })
  const originalDoc = instance.state.doc
  isEmpty.value = instance.isEmpty
  editor.value = instance
}

watch([() => props.content, taskId], ([content, id], [, previousId]) => {
  if (id !== previousId || content !== lastMarkdown) replaceEditor(content)
})
watch(readonly, (value) => {
  const current = editor.value
  if (!current) return
  current.setEditable(!value, false)
  if (value) {
    dismiss(current)
    linkDialogOpen.value = false
  }
})
watch(
  slashMenu,
  (menu) => {
    if (props.externalMenu) emit("menu", menu)
  },
  {flush: "sync"},
)

onMounted(() => replaceEditor(props.content))
onBeforeUnmount(() => {
  const current = editor.value
  if (!current) return
  dismiss(current)
  current.destroy()
})

defineExpose({
  focus: () => editor.value?.commands.focus(),
  resetHistory: () => replaceEditor(lastMarkdown),
  pickCompletion: pick,
})
</script>

<template>
  <div ref="container" :class="containerClass" :style="minLines ? {'--editor-min-lines': minLines} : null">
    <EditorContent v-if="editor" :editor="editor" class="editor-body" @click="onContentClick" />
    <span v-if="isEmpty && !readonly" class="pointer-events-none absolute start-0 top-0 text-sm opacity-40" aria-hidden="true">
      {{ placeholder ?? "Type / for commands" }}
    </span>
    <FloatingToolbar v-if="editor && !readonly" :editor="editor" @edit-link="openLinkDialog" />
    <EditLinkDialog v-if="editor && linkDialogOpen" :editor="editor" @close="closeLinkDialog" />
    <Teleport v-if="slashMenu && !externalMenu" to="body">
      <div ref="slashPanel" class="z-60" :style="floatingStyles">
        <SlashCommandRows :menu="slashMenu" @pick="pick" />
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.editor-body {
  height: 100%;
  max-height: var(--editor-max-height, none);
  overflow: auto;
}

.markdown-editor.is-grow .editor-body {
  height: auto;
  overflow: visible;
}

.editor-body :deep(.tiptap) {
  min-width: 0;
  min-height: 100%;
  outline: none;
  color: var(--color-base-content);
  caret-color: var(--color-accent);
  font-family: var(--font-sans);
  font-size: 0.875rem;
  line-height: var(--editor-line-height, 1.5);
  overflow-wrap: anywhere;
}

.markdown-editor.has-min-lines :deep(.tiptap) {
  min-height: calc(var(--editor-min-lines) * var(--editor-line-height, 1.5em));
}

.editor-body :deep(.tiptap h1),
.editor-body :deep(.tiptap h2),
.editor-body :deep(.tiptap h3),
.editor-body :deep(.tiptap h4),
.editor-body :deep(.tiptap h5),
.editor-body :deep(.tiptap h6) {
  font-weight: 600;
  line-height: 1.2;
  margin-block: 0.5em;
}

.editor-body :deep(.tiptap h1) {
  font-size: 1.25em;
}
.editor-body :deep(.tiptap h2) {
  font-size: 1.2em;
}
.editor-body :deep(.tiptap h3) {
  font-size: 1.15em;
}
.editor-body :deep(.tiptap h4) {
  font-size: 1.1em;
}
.editor-body :deep(.tiptap h5) {
  font-size: 1.05em;
}

.editor-body :deep(.tiptap ul:not([data-type="taskList"])) {
  list-style: disc;
}
.editor-body :deep(.tiptap ol) {
  list-style: decimal;
}
.editor-body :deep(.tiptap ul),
.editor-body :deep(.tiptap ol) {
  padding-inline-start: 1.5rem;
}

.editor-body :deep(.tiptap ul[data-type="taskList"] > li) {
  display: flex;
  align-items: flex-start;
  gap: 0.5em;
}
.editor-body :deep(.tiptap ul[data-type="taskList"] > li > div) {
  min-width: 0;
}
.editor-body :deep(.tiptap li[data-type="taskItem"] input) {
  accent-color: var(--color-accent);
}

.editor-body :deep(.tiptap blockquote) {
  border-inline-start: 0.25em solid var(--color-warning);
  padding-inline-start: 0.5em;
  color: var(--color-warning);
  font-style: italic;
}

.editor-body :deep(.tiptap hr) {
  border: 0;
  border-block-start: 1px solid var(--color-base-300);
  margin-block: 0.75rem;
}

.editor-body :deep(.tiptap a) {
  color: var(--color-info);
}
.editor-body :deep(.tiptap a:hover) {
  text-decoration: underline;
}

.editor-body :deep(.tiptap .tableWrapper) {
  max-width: 100%;
  overflow-x: auto;
  margin-block: 0.5rem;
}

.editor-body :deep(.tiptap table) {
  border-collapse: collapse;
  font-size: 0.8em;
}

.editor-body :deep(.tiptap td),
.editor-body :deep(.tiptap th) {
  padding: 6px 13px;
  min-width: 3rem;
  border: 1px solid var(--color-base-300);
  text-align: start;
}

.editor-body :deep(.tiptap th) {
  background: var(--color-base-300);
  font-weight: 600;
}

.editor-body :deep(.tiptap td.selectedCell),
.editor-body :deep(.tiptap th.selectedCell),
.editor-body :deep(.tiptap ::selection) {
  background: var(--color-editor-selection);
}

.editor-body :deep(.tiptap :not(pre) > code) {
  font-family: var(--font-mono);
  background: var(--color-base-300);
  padding: 0.1em 0.3em;
  border-radius: 3px;
}

.editor-body :deep(.tiptap .daily-markdown-code-block) {
  position: relative;
}

.editor-body :deep(.tiptap .markdown-code-copy) {
  position: absolute;
  inset-block-start: 0.35rem;
  inset-inline-end: 0.4rem;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  z-index: 1;
  width: 1.5rem;
  height: 1.5rem;
  border-radius: 5px;
  cursor: pointer;
  background: color-mix(in srgb, var(--color-base-100) 80%, transparent);
  opacity: 0.55;
}

.editor-body :deep(.tiptap .markdown-code-copy[hidden]) {
  display: none;
}

.editor-body :deep(.tiptap .markdown-code-copy:hover),
.editor-body :deep(.tiptap .markdown-code-copy.is-copied) {
  opacity: 1;
}

.editor-body :deep(.tiptap .markdown-code-copy.is-copied) {
  color: var(--color-success);
}

.editor-body :deep(.tiptap pre) {
  padding: 0.75rem;
  margin-block: 0.5rem;
  border-radius: 0.5rem;
  background: var(--color-base-200);
  font-family: var(--font-mono);
  overflow-x: auto;
  white-space: pre;
  overflow-wrap: normal;
}

.editor-body :deep(.tiptap .hljs-keyword),
.editor-body :deep(.tiptap .hljs-operator) {
  color: var(--color-error);
}
.editor-body :deep(.tiptap .hljs-string),
.editor-body :deep(.tiptap .hljs-regexp) {
  color: var(--color-success);
}
.editor-body :deep(.tiptap .hljs-number),
.editor-body :deep(.tiptap .hljs-literal),
.editor-body :deep(.tiptap .hljs-attr) {
  color: var(--color-info);
}
.editor-body :deep(.tiptap .hljs-title),
.editor-body :deep(.tiptap .hljs-built_in) {
  color: var(--color-accent);
}
.editor-body :deep(.tiptap .hljs-comment) {
  opacity: 0.55;
  font-style: italic;
}

.editor-body :deep(.tiptap .daily-markdown-literal-block) {
  white-space: pre-wrap;
}
.editor-body :deep(.tiptap img[src]) {
  cursor: zoom-in;
}
</style>
