import {computed, ref} from "vue"
import {defineStore} from "pinia"

import {API} from "@/api"
import {applyChangeset} from "@/utils/storage/applyChangeset"
import {useSettingsStore} from "./settings.store"
import {useTasksStore} from "./tasks"

import type {Branch, ISODate, Milestone, MilestoneProgress} from "@daily/protocol"

/** A milestone with the progress computed for it — from tasks in memory, never stored. */
export type MilestoneWithProgress = Milestone & {progress: MilestoneProgress}

export const useMilestonesStore = defineStore("milestones", () => {
  const settingsStore = useSettingsStore()
  const tasksStore = useTasksStore()

  const isMilestonesLoaded = ref(false)
  const milestones = ref<Milestone[]>([])

  const milestoneViews = computed<MilestoneWithProgress[]>(() => {
    const progressByMilestoneId = new Map<Milestone["id"], MilestoneProgress>()

    for (const [milestoneId, tasks] of tasksStore.tasksByMilestoneId) {
      const resolved = tasks.filter((task) => task.status === "done" || task.status === "discarded").length
      progressByMilestoneId.set(milestoneId, {total: tasks.length, resolved})
    }

    return milestones.value.map((milestone) => ({
      ...milestone,
      progress: progressByMilestoneId.get(milestone.id) ?? {total: 0, resolved: 0},
    }))
  })

  const milestonesMap = computed(
    () => new Map<Milestone["id"], MilestoneWithProgress>(milestoneViews.value.map((milestone) => [milestone.id, milestone])),
  )
  const activeBranchId = computed(() => settingsStore.settings?.branch?.activeId ?? null)
  const activeMilestones = computed(() => (activeBranchId.value ? milestonesForBranch(activeBranchId.value) : []))

  function milestonesForBranch(branchId: Branch["id"]): MilestoneWithProgress[] {
    return milestoneViews.value.filter((milestone) => milestone.branchId === branchId)
  }

  async function getMilestoneList() {
    isMilestonesLoaded.value = false

    try {
      milestones.value = await API.getMilestoneList()
    } catch (error) {
      console.error("Error loading milestones:", error)
      throw error
    } finally {
      isMilestonesLoaded.value = true
    }
  }

  async function createMilestone(name: string, targetDate: ISODate | null, branchId: Branch["id"]): Promise<Milestone | null> {
    try {
      const changeset = await API.createMilestone({branchId, name, description: "", targetDate, deletedAt: null})
      applyChangeset({milestones}, changeset)
      return changeset.milestones?.upserted?.[0] ?? null
    } catch (error) {
      console.error("Failed to create milestone", error)
      return null
    }
  }

  async function updateMilestone(
    id: Milestone["id"],
    updates: Partial<Pick<Milestone, "name" | "description" | "targetDate" | "orderIndex">>,
  ): Promise<Milestone | null> {
    try {
      const changeset = await API.updateMilestone(id, updates)
      return changeset.milestones?.upserted?.find((milestone) => milestone.id === id) ?? null
    } catch (error) {
      console.error("Failed to update milestone", error)
      return null
    }
  }

  async function deleteMilestone(id: Milestone["id"]): Promise<boolean> {
    try {
      const changeset = await API.deleteMilestone(id)
      return Boolean(changeset.milestones?.removed?.includes(id))
    } catch (error) {
      console.error("Failed to delete milestone", error)
      return false
    }
  }

  return {
    isMilestonesLoaded,
    milestones,
    milestonesMap,
    activeMilestones,

    milestonesForBranch,
    getMilestoneList,
    createMilestone,
    updateMilestone,
    deleteMilestone,
  }
})
