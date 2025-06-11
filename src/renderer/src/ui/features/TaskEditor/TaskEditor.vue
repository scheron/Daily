<script setup lang="ts">
import {computed, onMounted, onUnmounted, useTemplateRef} from "vue"
import {toast} from "vue-sonner"
import {until, useEventListener} from "@vueuse/core"
import {useDevice} from "@/composables/useDevice"
import {useTaskEditorStore} from "@/stores/taskEditor.store"
import {useTasksStore} from "@/stores/tasks.store"

import EditorPlaceholder from "./fragments/EditorPlaceholder.vue"

const tasksStore = useTasksStore()
const taskEditorStore = useTaskEditorStore()

const {isTablet, isMacOS} = useDevice()

const content = computed({
  get: () => taskEditorStore.editorContent,
  set: (value) => taskEditorStore.setEditorContent(value),
})

const contentField = useTemplateRef<HTMLElement>("contentField")

function focusContentField(setCursorToEnd = false) {
  if (!contentField.value) return

  contentField.value.focus()

  if (setCursorToEnd) {
    const range = document.createRange()
    const selection = window.getSelection()

    range.selectNodeContents(contentField.value)
    range.collapse(false)

    selection?.removeAllRanges()
    selection?.addRange(range)
  }
}

function onInput() {
  if (!contentField.value) return
  content.value = contentField.value.innerText || ""
}

function clearEditor() {
  if (contentField.value) {
    contentField.value.textContent = ""
  }
  taskEditorStore.setEditorContent("")
}

async function onSave(): Promise<boolean> {
  if (!content.value.trim()) return false

  let isSuccess = false

  if (taskEditorStore.currentEditingTask) {
    isSuccess = await tasksStore.updateTask(taskEditorStore.currentEditingTask.id, {content: content.value.trim()})

    if (!isSuccess) {
      toast.error("Failed to update task")
      return false
    }

    toast.success("Task updated successfully")
  } else {
    isSuccess = await tasksStore.createTask(content.value.trim())

    if (!isSuccess) {
      toast.error("Failed to create task")
      return false
    }

    toast.success("Task created successfully")
  }

  clearEditor()
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

function onClose() {
  taskEditorStore.setIsTaskEditorOpen(false)
  taskEditorStore.setCurrentEditingTask(null)
}

onMounted(async () => {
  await until(contentField).toBeTruthy()

  if (contentField.value) {
    contentField.value.innerText = content.value
    const isEditing = !!taskEditorStore.currentEditingTask
    focusContentField(isEditing)
  }
})

onUnmounted(() => taskEditorStore.setEditorContent(""))

useEventListener(contentField, "keydown", (event) => {
  const key = isMacOS ? "metaKey" : "ctrlKey"
  if (event.key === "Escape") {
    onClose()
    return
  }

  if (event.key === "Enter") {
    if (event.shiftKey) return

    event.preventDefault()

    if (event[key]) onSaveAndContinue()
    else onSaveAndClose()
  }
})
</script>

<template>
  <div class="relative h-full min-h-full flex-1 p-2">
    <div
      ref="contentField"
      class="markdown size-full cursor-text border border-base-300 overflow-y-auto rounded-lg p-4 pb-0 outline-none"
      contenteditable="true"
      @input="onInput"
    ></div>

    <EditorPlaceholder v-show="!isTablet && !content.trim()" />
  </div>
</template>
