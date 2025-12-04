<script setup lang="ts">
import {computed, onMounted, onUnmounted, watch} from "vue"
import {toast} from "vue-sonner"

import {useClipboardPaste} from "@/composables/useClipboardPaste"
import {useCodeMirror} from "@/composables/useCodeMirror"
import {useFileDrop} from "@/composables/useFileDrop"
import {createMarkdownKeymap} from "@/utils/codemirror/commands/keymap"
import {createAutoPairsExtension} from "@/utils/codemirror/extensions/autoPairs"
import {createBlockContinuationExtension} from "@/utils/codemirror/extensions/blockContinuation"
import {createCodeBlockAutocomplete} from "@/utils/codemirror/extensions/codeBlockAutocomplete"
import {createCodeSyntaxExtension} from "@/utils/codemirror/extensions/codeSyntax"
import {createThemeExtension} from "@/utils/codemirror/extensions/theme"
import {createWYSIWYGExtension} from "@/utils/codemirror/extensions/wysiwyg"

import {useTaskEditorStore} from "@MainView/stores/taskEditor.store"
import {indentWithTab} from "@codemirror/commands"
import {EditorView} from "@codemirror/view"
import {useEditTask} from "./composables/useEditTask"
import {useImageUpload} from "./composables/useImageUpload"
import EditorPlaceholder from "./{fragments}/EditorPlaceholder.vue"
import FloatingToolbar from "./{fragments}/FloatingToolbar.vue"

const taskEditorStore = useTaskEditorStore()

const content = computed({
  get: () => taskEditorStore.editorContent,
  set: (v) => taskEditorStore.setEditorContent(v),
})

const {createOrUpdate} = useEditTask()
const {uploadImageFile} = useImageUpload()

const {view, container, setContent, insertText, focus} = useCodeMirror({
  content: content.value,
  onUpdate: (newContent) => (content.value = newContent),
  extensions: [
    EditorView.lineWrapping,
    createThemeExtension(),
    createWYSIWYGExtension(),
    createCodeSyntaxExtension(),
    createCodeBlockAutocomplete(),
    createAutoPairsExtension(),
    createBlockContinuationExtension(),
  ],
  shortcuts: [
    indentWithTab,
    {
      key: "Mod-Enter",
      run: () => {
        onSaveAndClose()
        return true
      },
    },
    {
      key: "Mod-Shift-Enter",
      run: () => {
        onSaveAndContinue()
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
    ...createMarkdownKeymap(),
  ],
})

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

watch(
  () => taskEditorStore.editorContent,
  (newContent) => {
    if (newContent !== content.value) {
      setContent(newContent)
    }
  },
)

onMounted(() => {
  if (taskEditorStore.currentEditingTask) {
    setContent(taskEditorStore.editorContent)
  }
  setTimeout(focus, 100)
})

onUnmounted(() => clearEditor({discardFiles: true, discardTags: true}))

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
    toast.error(`Only image files are supported. "${file.name}" is not an image.`)
  },
})
</script>

<template>
  <div class="relative h-full min-h-full flex-1 p-2">
    <div
      ref="container"
      class="bg-base-100 border-base-300 size-full cursor-text overflow-y-auto rounded-lg border transition-colors"
      :class="{'ring-offset-base-100 ring-accent/50 ring-2': isDraggingOver}"
    ></div>
    <EditorPlaceholder v-show="!content.trim()" />
    <FloatingToolbar v-if="view" :editor-view="view" />
  </div>
</template>
