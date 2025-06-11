import {sleep} from "@/utils/misc"

import {h} from "vue"
import {toast} from "vue-sonner"

import DeleteSuccess from "../fragments/toasts/DeleteSuccess.vue"

import type {Task} from "@/types/tasks"

export function useRestoreTaskToast(onRestore: (task: Task) => Promise<boolean>) {
  return (task: Task) => {
    if (!task) return

    const toastId = toast(
      h(DeleteSuccess, {
        taskContent: task.content,
        onRestore: async () => {
          const isSuccess = await onRestore(task)
          if (isSuccess) toast.success("Task restored successfully", {id: toastId})
          else toast.error("Failed to restore task", {id: toastId})

          await sleep(2_000)
          toast.dismiss(toastId)
        },
      }),
      {duration: 10_000},
    )
  }
}
