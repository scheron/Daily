import {toasts} from "vue-toasts-lite"

import {useTaskEditorStore} from "@/stores/taskEditor.store"
import {useTasksStore} from "@/stores/tasks.store"

export function useEditTask() {
  const taskEditorStore = useTaskEditorStore()
  const tasksStore = useTasksStore()

  async function create(content: string) {
    const text = content.trim()
    if (!text) return false

    return await tasksStore.createTask({
      content: text,
      tags: taskEditorStore.editorTags,
    })
  }

  async function update(content: string) {
    if (!taskEditorStore.currentEditingTask) return false

    const text = content.trim()
    if (!text) return false

    return await tasksStore.updateTask(taskEditorStore.currentEditingTask.id, {
      content: text,
      tags: taskEditorStore.editorTags,
      minimized: true,
    })
  }

  async function createOrUpdate(content: string) {
    const text = content.trim()
    if (!text) return false

    if (taskEditorStore.currentEditingTask) {
      const isUpdated = await update(text)

      if (isUpdated) toasts.success("Task updated successfully")
      else toasts.error("Failed to update task")

      return isUpdated
    } else {
      const isCreated = await create(text)
      if (isCreated) toasts.success("Task created successfully")
      else toasts.error("Failed to create task")

      return isCreated
    }
  }

  return {
    create,
    update,
    createOrUpdate,
  }
}
