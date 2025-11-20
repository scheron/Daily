import {ref} from "vue"
import {defineStore} from "pinia"

import type {Tag, Task} from "@/types/tasks"

export const useTaskEditorStore = defineStore("taskEditor", () => {
  const currentEditingTask = ref<Task | null>(null)

  const editorContent = ref("")
  const editorTags = ref<Tag[]>([])
  const isTaskEditorOpen = ref(false)
  const isMoveDatePickerOpen = ref(false)

  function setCurrentEditingTask(task: Task | null) {
    currentEditingTask.value = task
    editorContent.value = task ? task.content : ""
  }

  function setEditorContent(content: string) {
    editorContent.value = content
  }

  function setEditorTags(tags: Tag[]) {
    editorTags.value = tags
  }

  function setIsTaskEditorOpen(isOpen: boolean) {
    if (!isOpen) {
      editorContent.value = ""
      editorTags.value = []
      currentEditingTask.value = null
    }
    isTaskEditorOpen.value = isOpen
  }

  function setIsMoveDatePickerOpen(isOpen: boolean) {
    isMoveDatePickerOpen.value = isOpen
  }

  return {
    currentEditingTask,
    editorContent,
    editorTags,
    isTaskEditorOpen,
    isMoveDatePickerOpen,

    setCurrentEditingTask,
    setEditorContent,
    setEditorTags,
    setIsTaskEditorOpen,
    setIsMoveDatePickerOpen,
  }
})
