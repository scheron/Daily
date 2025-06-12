<script setup lang="ts">
import {computed, onMounted, onUnmounted, useTemplateRef} from "vue"
import {toast} from "vue-sonner"
import {until, useEventListener} from "@vueuse/core"
import {useClipboardPaste} from "@/composables/useClipboardPaste"
import {useDevice} from "@/composables/useDevice"
import {useTaskEditorStore} from "@/stores/taskEditor.store"
import {useTasksStore} from "@/stores/tasks.store"

import EditorPlaceholder from "./fragments/EditorPlaceholder.vue"

const tasksStore = useTasksStore()
const taskEditorStore = useTaskEditorStore()
const {isMacOS} = useDevice()

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

async function onSave(): Promise<boolean> {
  const text = content.value.trim()
  if (!text) return false

  const committed = await taskEditorStore.commitAssets()
  const finalContent = taskEditorStore.replaceAttachments(text, committed)

  let ok = false
  if (taskEditorStore.currentEditingTask) {
    ok = await tasksStore.updateTask(taskEditorStore.currentEditingTask.id, {
      content: finalContent,
      tags: taskEditorStore.editorTags,
    })
    if (!ok) {
      toast.error("Failed to update task")
      return false
    }
    toast.success("Task updated successfully")
  } else {
    ok = await tasksStore.createTask({
      content: finalContent,
      tags: taskEditorStore.editorTags,
    })
    if (!ok) {
      toast.error("Failed to create task")
      return false
    }
    toast.success("Task created successfully")
  }

  clearEditor(false)
  return true
}

async function onSaveAndClose() {
  const success = await onSave()
  if (success) taskEditorStore.setIsTaskEditorOpen(false)
}

async function onSaveAndContinue() {
  const success = await onSave()
  if (success) focusContentField()
}

function clearEditor(discardFiles = true) {
  if (discardFiles) taskEditorStore.rollbackAssets()

  if (contentField.value) contentField.value.textContent = ""
  taskEditorStore.setEditorContent("")
  taskEditorStore.setEditorTags([])
  taskEditorStore.setCurrentEditingTask(null)
}

async function onClose() {
  clearEditor(true)
  taskEditorStore.setIsTaskEditorOpen(false)
}

onMounted(async () => {
  await until(contentField).toBeTruthy()
  if (!contentField.value) return

  contentField.value.innerText = content.value
  focusContentField(!!taskEditorStore.currentEditingTask)
})

onUnmounted(() => clearEditor(true))

useEventListener(contentField, "keydown", (event) => {
  const mod = isMacOS ? event.metaKey : event.ctrlKey
  if (event.key === "Escape") {
    onClose()
    return
  }
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault()
    mod ? onSaveAndContinue() : onSaveAndClose()
  }
})

useClipboardPaste(contentField, {
  onTextPaste: () => onInput(),
  onImagePaste: async (file) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      const dataUrl = e.target?.result as string
      const {id} = taskEditorStore.stageAsset(dataUrl, file.name)
      insertText(`![](temp:${id})`)
      onInput()
    }
    reader.readAsDataURL(file)
  },
})
</script>

<template>
  <div class="relative h-full min-h-full flex-1 p-2">
    <div
      ref="contentField"
      class="markdown border-base-300 size-full cursor-text overflow-y-auto rounded-lg border p-4 pb-0 outline-none"
      contenteditable="true"
      @input="onInput"
    ></div>
    <EditorPlaceholder v-show="!content.trim()" />
  </div>
</template>
