import {ref, watch} from "vue"

import {API} from "@/api"

import type {Branch, Task} from "@daily/protocol"
import type {ComputedRef} from "vue"

export type BacklogContext = {
  activeBranchId: ComputedRef<Branch["id"] | undefined>
}

/**
 * Owns the backlog task list: loads it, and reloads it when the active branch
 * changes — the same branch-switch mechanism `useTaskRange` uses for days.
 * @param ctx - The active branch id
 */
export function useBacklog(ctx: BacklogContext) {
  const backlogTasks = ref<Task[]>([])
  const isBacklogLoaded = ref(false)

  async function getBacklogList() {
    try {
      backlogTasks.value = await API.getBacklog({branchId: ctx.activeBranchId.value})
    } catch (error) {
      console.error("Failed to load backlog:", error)
    } finally {
      isBacklogLoaded.value = true
    }
  }

  watch(
    () => ctx.activeBranchId.value,
    (newId, oldId) => {
      if (newId !== oldId && isBacklogLoaded.value) {
        getBacklogList()
      }
    },
  )

  return {
    backlogTasks,
    getBacklogList,
  }
}
