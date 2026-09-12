import {computed, ref} from "vue"
import {defineStore} from "pinia"

import {API} from "@/api"
import {useSettingsStore} from "./settings.store"

import type {Branch, ISODate, Milestone, MilestoneView} from "@daily/protocol"

export const useMilestonesStore = defineStore("milestones", () => {
  const settingsStore = useSettingsStore()

  const isMilestonesLoaded = ref(false)
  const milestones = ref<MilestoneView[]>([])

  const milestonesMap = computed(() => new Map<Milestone["id"], MilestoneView>(milestones.value.map((milestone) => [milestone.id, milestone])))
  const activeBranchId = computed(() => settingsStore.settings?.branch?.activeId ?? null)
  const activeMilestones = computed(() => (activeBranchId.value ? milestonesForBranch(activeBranchId.value) : []))

  function milestonesForBranch(branchId: Branch["id"]): MilestoneView[] {
    return milestones.value.filter((milestone) => milestone.branchId === branchId)
  }

  async function getMilestoneList() {
    isMilestonesLoaded.value = false

    try {
      milestones.value = await API.getMilestoneList()
    } catch (error) {
      console.error("Error loading milestones:", error)
    } finally {
      isMilestonesLoaded.value = true
    }
  }

  async function createMilestone(name: string, targetDate: ISODate | null, branchId: Branch["id"]): Promise<MilestoneView | null> {
    const newMilestone = await API.createMilestone({branchId, name, description: "", targetDate, deletedAt: null})
    if (!newMilestone) return null

    milestones.value = [...milestones.value, newMilestone]

    return newMilestone
  }

  async function updateMilestone(
    id: Milestone["id"],
    updates: Partial<Pick<Milestone, "name" | "description" | "targetDate" | "orderIndex">>,
  ): Promise<MilestoneView | null> {
    const updatedMilestone = await API.updateMilestone(id, updates)
    if (!updatedMilestone) return null

    milestones.value = milestones.value.map((milestone) => (milestone.id === id ? updatedMilestone : milestone))

    return updatedMilestone
  }

  async function deleteMilestone(id: Milestone["id"]): Promise<boolean> {
    const deleted = await API.deleteMilestone(id)
    if (!deleted) return false

    milestones.value = milestones.value.filter((milestone) => milestone.id !== id)

    return true
  }

  async function revalidate() {
    try {
      milestones.value = await API.getMilestoneList()
    } catch (error) {
      console.error("Error revalidating milestones:", error)
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

    revalidate,
  }
})
