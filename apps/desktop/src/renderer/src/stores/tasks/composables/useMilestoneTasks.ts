import {computed, ref, watch} from "vue"

import {API} from "@/api"
import {useMilestonesStore} from "@/stores/milestones.store"

import type {Branch, Task} from "@daily/protocol"
import type {ComputedRef} from "vue"

export type MilestoneTasksContext = {
  activeBranchId: ComputedRef<Branch["id"] | undefined>
}

/**
 * Owns the task list the board shows in milestone mode: loads the selected
 * milestone's tasks, and reloads them when the mode, the selection or the
 * active branch changes — the same branch-switch mechanism `useBacklog` uses.
 * @param ctx - The active branch id
 */
export function useMilestoneTasks(ctx: MilestoneTasksContext) {
  const milestonesStore = useMilestonesStore()

  const milestoneTasks = ref<Task[]>([])
  const isMilestoneMode = computed(() => milestonesStore.mode === "milestone")

  async function getMilestoneTaskList() {
    try {
      milestoneTasks.value = await API.getMilestoneTasks({
        milestoneId: milestonesStore.selectedMilestoneId ?? undefined,
        branchId: ctx.activeBranchId.value,
      })
    } catch (error) {
      console.error("Failed to load milestone tasks:", error)
    }
  }

  watch([() => milestonesStore.mode, () => milestonesStore.selectedMilestoneId, () => ctx.activeBranchId.value], () => {
    if (!isMilestoneMode.value) return
    getMilestoneTaskList()
  })

  return {
    milestoneTasks,
    isMilestoneMode,
    getMilestoneTaskList,
  }
}
