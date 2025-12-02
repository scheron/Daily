<script setup lang="ts">
import {computed, onMounted, onUnmounted, watch} from "vue"
import {toast} from "vue-sonner"

import {
  createAutoPairsExtension,
  createCodeBlockAutocomplete,
  createCodeSyntaxExtension,
  createThemeExtension,
  createWYSIWYGExtension,
  useCodeMirror,
} from "@/composables/codemirror"
import {useClipboardPaste} from "@/composables/useClipboardPaste"
import {useDevice} from "@/composables/useDevice"
import {useFileDrop} from "@/composables/useFileDrop"

import {useTaskEditorStore} from "@MainView/stores/taskEditor.store"
import {keymap} from "@codemirror/view"
import {useEditTask} from "./composables/useEditTask"
import {useImageUpload} from "./composables/useImageUpload"
import EditorPlaceholder from "./{fragments}/EditorPlaceholder.vue"
import FloatingToolbar from "./{fragments}/FloatingToolbar.vue"
import {createMarkdownKeymap} from "./commands/markdownCommands"

const taskEditorStore = useTaskEditorStore()

const {isMacOS} = useDevice()
const {createOrUpdate} = useEditTask()
const {uploadImageFile} = useImageUpload()

const content = computed({
  get: () => taskEditorStore.editorContent,
  set: (v) => taskEditorStore.setEditorContent(v),
})

// Save handlers
async function onSaveAndClose() {
  const success = await createOrUpdate(content.value)
  if (!success) return

  taskEditorStore.setIsTaskEditorOpen(false)
  clearEditor({discardFiles: false, discardTags: true})
}

async function onSaveAndContinue() {
  const success = await createOrUpdate(content.value)
  if (!success) return

  view.value?.focus()
  clearEditor({discardFiles: false, discardTags: false})
}

function onCancel() {
  clearEditor({discardFiles: true, discardTags: true})
  taskEditorStore.setIsTaskEditorOpen(false)
}

function clearEditor(params: {discardFiles: boolean; discardTags: boolean}) {
  const {discardTags} = params

  setContent("")
  taskEditorStore.setEditorContent("")

  if (discardTags) taskEditorStore.setEditorTags([])
  taskEditorStore.setCurrentEditingTask(null)
}

// Handle Enter key based on modifier
function handleEnter(isMod: boolean) {
  if (isMod) {
    onSaveAndContinue()
  } else {
    onSaveAndClose()
  }
}

// Initialize CodeMirror
const {view, container, setContent, insertText, focus} = useCodeMirror({
  content: content.value,
  onUpdate: (newContent) => {
    content.value = newContent
  },
  extensions: [
    // Theme
    createThemeExtension(),

    // WYSIWYG rendering
    createWYSIWYGExtension(),

    // Code syntax highlighting
    createCodeSyntaxExtension(),

    // Code block auto-completion
    createCodeBlockAutocomplete(),

    // Auto-close brackets, quotes, and markdown markers
    createAutoPairsExtension(),

    // Keyboard shortcuts
    keymap.of([
      // Custom keybindings for save/cancel
      {
        key: "Enter",
        run: () => {
          handleEnter(false)
          return true
        },
      },
      {
        key: "Mod-Enter",
        run: () => {
          handleEnter(true)
          return true
        },
      },
      {
        key: "Escape",
        run: () => {
          onCancel()
          return true
        },
      },
      // Markdown formatting shortcuts
      ...createMarkdownKeymap(),
    ]),
  ],
  placeholder: "",
})

// Watch for content changes from store (when loading a task)
watch(
  () => taskEditorStore.editorContent,
  (newContent) => {
    // Only update if different (avoid feedback loop)
    if (newContent !== content.value) {
      setContent(newContent)
    }
  },
)

// Initialize editor with content when mounted
onMounted(() => {
  if (taskEditorStore.currentEditingTask) {
    setContent(taskEditorStore.editorContent)
  }
  // Focus at end if editing existing task
  setTimeout(() => {
    focus()
  }, 100)
})

onUnmounted(() => clearEditor({discardFiles: true, discardTags: true}))

// Clipboard paste handler
useClipboardPaste(container, {
  onTextPaste: () => {
    // Content updates automatically via CodeMirror
  },
  onImagePaste: async (file) => {
    const md = await uploadImageFile(file)
    if (md) insertText(md)
  },
})

// File drop handler
const {isDraggingOver} = useFileDrop(container, {
  onFileDrop: async (file) => {
    const md = await uploadImageFile(file)
    if (md) insertText(md)
  },
  onRejectedFile: (file) => {
    toast.error(`Only image files are supported. "${file.name}" is not an image.`)
  },
})
</script>

<template>
  <div class="relative h-full min-h-full flex-1 p-2">
    <div
      ref="container"
      class="markdown border-base-300 size-full cursor-text overflow-y-auto rounded-lg border transition-colors"
      :class="{'ring-offset-base-100 ring-accent/50 ring-2': isDraggingOver}"
    ></div>
    <EditorPlaceholder v-show="!content.trim()" />
    <FloatingToolbar :editor-view="view" />
  </div>
</template>
