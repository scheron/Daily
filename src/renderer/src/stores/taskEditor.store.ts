import {defineStore} from "pinia"
import {ref} from "vue"

import type {Task} from "@/types/tasks"

export const useTaskEditorStore = defineStore("taskEditor", () => {
  const currentEditingTask = ref<Task | null>(null)
  const editorContent = ref("")
  const isTaskEditorOpen = ref(false)
  const isTaskDeleteConfirmOpen = ref(false)

  function setCurrentEditingTask(task: Task | null) {
    currentEditingTask.value = task
    if (task) {
      editorContent.value = task.content
    } else {
      editorContent.value = ""
    }
  }

  function setEditorContent(content: string) {
    editorContent.value = content
  }

  function setIsTaskEditorOpen(isOpen: boolean) {
    if (!isOpen) {
      editorContent.value = ""
    }
    isTaskEditorOpen.value = isOpen
  }

  function setIsTaskDeleteConfirmOpen(isOpen: boolean) {
    isTaskDeleteConfirmOpen.value = isOpen
  }

  return {
    currentEditingTask,
    editorContent,
    isTaskEditorOpen,
    isTaskDeleteConfirmOpen,
    setCurrentEditingTask,
    setEditorContent,
    setIsTaskEditorOpen,
    setIsTaskDeleteConfirmOpen,
  }
})
