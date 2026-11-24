import {storeToRefs} from "pinia"

import {useCopyToClipboard} from "@/composables/useCopyToClipboard"
import {toasts} from "@/composables/useToasts"
import {useSubtasksStore} from "@/stores/subtasks"
import {useTaskEditorStore} from "@/stores/task-editor"
import {toTaskYaml} from "@/utils/tasks/toTaskYaml"

import type {Task} from "@daily/protocol"

/** Copies a saved task and its live subtasks as raw YAML, refusing when the target task has unsaved panel edits. */
export function useCopyTask() {
  const subtasksStore = useSubtasksStore()
  const taskEditorStore = useTaskEditorStore()
  const {editingTaskId, isDirty} = storeToRefs(taskEditorStore)

  const {copyToClipboard, isCopied} = useCopyToClipboard({
    onSuccess: () => toasts.success("Task copied to clipboard"),
  })

  async function copyTask(task: Pick<Task, "id" | "content">): Promise<void> {
    if (isBlockedByUnsavedDraft(task.id)) return

    try {
      await subtasksStore.loadSubtasks(task.id)
    } catch {
      toasts.error("Failed to copy task")
      return
    }

    if (isBlockedByUnsavedDraft(task.id)) return

    await copyToClipboard(toTaskYaml(task, subtasksStore.subtasksOf(task.id)))
  }

  function isBlockedByUnsavedDraft(taskId: Task["id"]): boolean {
    if (editingTaskId.value !== taskId || !isDirty.value) return false
    toasts.info("Save changes before copying task")
    return true
  }

  return {copyTask, isCopied}
}
