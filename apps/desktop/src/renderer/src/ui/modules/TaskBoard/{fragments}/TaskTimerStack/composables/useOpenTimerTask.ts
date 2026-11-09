import {useTaskEditorStore} from "@/stores/task-editor"
import {useTaskTimersStore} from "@/stores/task-timers"
import {useConfirmUnsavedModal} from "@/ui/overlays/ConfirmUnsavedModal"

import type {Task} from "@daily/protocol"

export function useOpenTimerTask() {
  const taskEditorStore = useTaskEditorStore()
  const taskTimersStore = useTaskTimersStore()
  const {open: confirmLeaveIfDirty} = useConfirmUnsavedModal()

  async function openTimerTask(taskId: Task["id"]) {
    if (taskEditorStore.editingTaskId !== taskId) {
      if (!(await confirmLeaveIfDirty())) return
      await taskEditorStore.open(taskId)
    }

    if (taskEditorStore.editingTaskId === taskId) await taskTimersStore.dispatch({type: "promote", taskId})
  }

  return {openTimerTask}
}
