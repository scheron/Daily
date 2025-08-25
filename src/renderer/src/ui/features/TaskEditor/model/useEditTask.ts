import {toast} from "vue-sonner"
import {useTaskEditorStore} from "@/stores/taskEditor.store"
import {useTasksStore} from "@/stores/tasks.store"

import type {ISODate} from "@/types/date"

export function useEditTask() {
  const taskEditorStore = useTaskEditorStore()
  const tasksStore = useTasksStore()

  async function create(content: string) {
    const text = content.trim()
    if (!text) return false

    const committed = await taskEditorStore.commitAssets()
    const finalContent = taskEditorStore.replaceAttachments(text, committed)

    return await tasksStore.createTask({
      content: finalContent,
      tags: taskEditorStore.editorTags,
    })
  }

  async function update(content: string) {
    if (!taskEditorStore.currentEditingTask) return false

    const text = content.trim()
    if (!text) return false

    const committed = await taskEditorStore.commitAssets()
    const finalContent = taskEditorStore.replaceAttachments(text, committed)

    return await tasksStore.updateTask(taskEditorStore.currentEditingTask.id, {
      content: finalContent,
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

  async function move(targetDate: ISODate) {
    if (!taskEditorStore.currentEditingTask) return

    const success = await update(taskEditorStore.editorContent)
    if (!success) return

    const isMoved = await tasksStore.moveTask(taskEditorStore.currentEditingTask.id, targetDate)

    if (isMoved) toast.success("Task moved successfully")
    else toast.error("Failed to move task")

    return isMoved
  }

  return {
    create,
    update,
    createOrUpdate,
    move,
  }
}
