import {toast} from "vue-sonner"
import {useTasksStore} from "@/stores/tasks.store"

import {useTaskEditorStore} from "@/ui/views/Main/model/taskEditor.store"

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
    })
  }

  async function createOrUpdate(content: string) {
    const text = content.trim()
    if (!text) return false

    if (taskEditorStore.currentEditingTask) {
      const isUpdated = await update(text)

      if (isUpdated) toast.success("Task updated successfully")
      else toast.error("Failed to update task")

      return isUpdated
    } else {
      const isCreated = await create(text)
      if (isCreated) toast.success("Task created successfully")
      else toast.error("Failed to create task")

      return isCreated
    }
  }

  return {
    create,
    update,
    createOrUpdate,
  }
}
