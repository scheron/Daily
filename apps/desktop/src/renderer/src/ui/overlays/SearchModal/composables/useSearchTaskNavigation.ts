import {toasts} from "@/composables/useToasts"
import {useBranchesStore} from "@/stores/branches"
import {useProjectScopeStore} from "@/stores/project-scope"
import {useTaskEditorStore} from "@/stores/task-editor"
import {useTasksStore} from "@/stores/tasks"
import {useConfirmUnsavedModal} from "@/ui/overlays/ConfirmUnsavedModal"

import type {TaskSearchResult} from "@daily/protocol"

export function useSearchTaskNavigation() {
  const tasksStore = useTasksStore()
  const branchesStore = useBranchesStore()
  const projectScopeStore = useProjectScopeStore()
  const taskEditorStore = useTaskEditorStore()

  const {open: confirmLeaveIfDirty} = useConfirmUnsavedModal()

  async function prepareNavigation({task, branch}: TaskSearchResult): Promise<"board" | "editor" | null> {
    if (branch?.deletedAt) {
      toasts.error("Task belongs to a deleted project")
      return null
    }

    if (!task.scheduled) {
      if (taskEditorStore.editingTaskId === task.id) return "editor"
      if (!(await confirmLeaveIfDirty())) return null
    }

    if (!projectScopeStore.isAllProjectsMode && branchesStore.activeBranchId !== task.branchId) {
      await branchesStore.setActiveBranch(task.branchId)
    }

    if (!task.scheduled) {
      void taskEditorStore.open(task.id)
      return "editor"
    }

    tasksStore.setActiveDay(task.scheduled.date)
    return "board"
  }

  return {prepareNavigation}
}
