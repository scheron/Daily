<script setup lang="ts">
import {Buffer} from "buffer"
import {computed, onMounted, onUnmounted, useTemplateRef} from "vue"
import {until, useEventListener} from "@vueuse/core"
import {toast} from "vue-sonner"
import {useClipboardPaste} from "@/composables/useClipboardPaste"
import {useFileDrop} from "@/composables/useFileDrop"
import {useDevice} from "@/composables/useDevice"
import {useTaskEditorStore} from "@/stores/taskEditor.store"

import EditorPlaceholder from "./fragments/EditorPlaceholder.vue"
import {useEditTask} from "./model/useEditTask"
import { calculateProportionalSize, getImageDimensions } from "@/utils/images"

const taskEditorStore = useTaskEditorStore()

const {isMacOS} = useDevice()
const {createOrUpdate} = useEditTask()

const content = computed({
  get: () => taskEditorStore.editorContent,
  set: (v) => taskEditorStore.setEditorContent(v),
})

const contentField = useTemplateRef<HTMLElement>("contentField")

function insertText(text: string) {
  const frag = document.createDocumentFragment()

  text.split("\n").forEach((line, i, arr) => {
    frag.appendChild(document.createTextNode(line))
    if (i < arr.length - 1) frag.appendChild(document.createElement("br"))
  })

  const sel = window.getSelection()
  if (sel?.rangeCount) {
    const range = sel.getRangeAt(0)
    range.deleteContents()
    range.insertNode(frag)
    range.collapse(false)
    sel.removeAllRanges()
    sel.addRange(range)
  } else {
    contentField.value?.appendChild(frag)
  }
}

async function processImageFile(file: File) {
  const reader = new FileReader()
  reader.onload = async (e) => {
    const dataUrl = e.target?.result as string

    const [, base64] = dataUrl.split(",")
    const binary = atob(base64)
    const len = binary.length
    const arr = new Uint8Array(len)
    for (let i = 0; i < len; i++) arr[i] = binary.charCodeAt(i)
    const buffer = Buffer.from(arr)

    try {
      console.log("Saving file:", file.name)
      const id = await window.electronAPI.saveFile(file.name, buffer)
      const url = await window.electronAPI.getFilePath(id)
      const filename = file.name || "image"

      const {width, height} = await getImageDimensions(dataUrl)
      const {width: displayWidth, height: displayHeight} = calculateProportionalSize(width, height)

      insertText(`![${filename} =${displayWidth}x${displayHeight}](${url})`)
      onInput()
    } catch (error) {
      console.error("Failed to save file:", error)
    }
  }
  reader.readAsDataURL(file)
}

function focusContentField(toEnd = false) {
  const el = contentField.value
  if (!el) return

  el.focus()

  if (toEnd) {
    const range = document.createRange()
    const sel = window.getSelection()
    range.selectNodeContents(el)
    range.collapse(false)
    sel?.removeAllRanges()
    sel?.addRange(range)
  }
}

function onInput() {
  if (!contentField.value) return
  content.value = contentField.value.innerText || ""
}

async function onSaveAndClose() {
  const success = await createOrUpdate(content.value)
  if (!success) return

  taskEditorStore.setIsTaskEditorOpen(false)
  clearEditor({discardFiles: false, discardTags: true})
}

async function onSaveAndContinue() {
  const success = await createOrUpdate(content.value)
  if (!success) return

  focusContentField()
  clearEditor({discardFiles: false, discardTags: false})
}

function clearEditor(params: {discardFiles: boolean; discardTags: boolean}) {
  const {discardTags} = params

  if (contentField.value) contentField.value.textContent = ""
  taskEditorStore.setEditorContent("")

  if (discardTags) taskEditorStore.setEditorTags([])
  taskEditorStore.setCurrentEditingTask(null)
}

onMounted(async () => {
  await until(contentField).toBeTruthy()
  if (!contentField.value) return

  contentField.value.innerText = content.value
  focusContentField(!!taskEditorStore.currentEditingTask)
})

onUnmounted(() => clearEditor({discardFiles: true, discardTags: true}))

useEventListener(contentField, "keydown", (event) => {
  const mod = isMacOS ? event.metaKey : event.ctrlKey

  if (event.key === "Escape") {
    clearEditor({discardFiles: true, discardTags: true})
    taskEditorStore.setIsTaskEditorOpen(false)
    return
  }

  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault()
    mod ? onSaveAndContinue() : onSaveAndClose()
  }
})

useClipboardPaste(contentField, {
  onTextPaste: () => onInput(),
  onImagePaste: processImageFile,
})

const {isDraggingOver} = useFileDrop(contentField, {
  onFileDrop: processImageFile,
  onRejectedFile: (file) => {
    toast.error(`Only image files are supported. "${file.name}" is not an image.`)
  },
})
</script>

<template>
  <div class="relative h-full min-h-full flex-1 p-2">
    <div
      ref="contentField"
      class="markdown border-base-300 size-full cursor-text overflow-y-auto rounded-lg border p-4 pb-0 outline-none transition-colors"
      :class="{'ring-2 ring-blue-500 ring-offset-2 bg-blue-50/50': isDraggingOver}"
      contenteditable="true"
      @input="onInput"
    ></div>
    <EditorPlaceholder v-show="!content.trim()" />
  </div>
</template>
