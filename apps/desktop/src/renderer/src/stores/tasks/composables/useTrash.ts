import {ref, watch} from "vue"

import {API} from "@/api"

import type {Branch, Task} from "@daily/protocol"
import type {ComputedRef} from "vue"

export type TrashContext = {
  activeBranchId: ComputedRef<Branch["id"] | undefined>
}

const TRASH_LIMIT = 100

/**
 * Owns the trash list: loads the deleted tasks, keeps them in sync with the
 * deletions made elsewhere, and reloads on a branch switch — the same mechanism
 * `useBacklog` uses for the backlog.
 * @param ctx - The active branch id
 */
export function useTrash(ctx: TrashContext) {
  const trashTasks = ref<Task[]>([])
  const isTrashLoaded = ref(false)

  async function getTrashList() {
    try {
      trashTasks.value = await API.getDeletedTasks({limit: TRASH_LIMIT, branchId: ctx.activeBranchId.value})
    } catch (error) {
      console.error("Failed to load trash:", error)
    } finally {
      isTrashLoaded.value = true
    }
  }

  async function refreshTrash() {
    if (!isTrashLoaded.value) return
    await getTrashList()
  }

  function dropFromTrash(taskId: Task["id"]) {
    trashTasks.value = trashTasks.value.filter((task) => task.id !== taskId)
  }

  function clearTrash() {
    trashTasks.value = []
  }

  watch(
    () => ctx.activeBranchId.value,
    (newId, oldId) => {
      if (newId !== oldId && isTrashLoaded.value) {
        getTrashList()
      }
    },
  )

  return {
    trashTasks,
    isTrashLoaded,
    getTrashList,
    refreshTrash,
    dropFromTrash,
    clearTrash,
  }
}
