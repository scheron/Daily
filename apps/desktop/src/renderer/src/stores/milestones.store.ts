import {computed, ref, watch} from "vue"
import {defineStore} from "pinia"

import {MAIN_BRANCH_ID} from "@daily/protocol"

import {API} from "@/api"
import {useSettingsStore} from "./settings.store"

import type {ISODate, Milestone, MilestoneWithProgress} from "@daily/protocol"

export type BoardMode = "day" | "milestone"

export const useMilestonesStore = defineStore("milestones", () => {
  const settingsStore = useSettingsStore()

  const isMilestonesLoaded = ref(false)
  const milestones = ref<MilestoneWithProgress[]>([])
  const mode = ref<BoardMode>("day")
  const selectedMilestoneId = ref<Milestone["id"] | null>(null)

  const activeBranchId = computed(() => settingsStore.settings?.branch?.activeId)

  async function getMilestoneList() {
    try {
      milestones.value = await API.getMilestoneList({branchId: activeBranchId.value})
    } catch (error) {
      console.error("Failed to load milestones:", error)
    } finally {
      isMilestonesLoaded.value = true
    }
  }

  function setMode(newMode: BoardMode) {
    mode.value = newMode
  }

  function selectMilestone(id: Milestone["id"] | null) {
    selectedMilestoneId.value = id
  }

  async function createMilestone(input: {name: string; date?: ISODate | null; description?: string | null}): Promise<Milestone | null> {
    const name = input.name.trim()
    if (!name) return null

    const created = await API.createMilestone({...input, name, branchId: activeBranchId.value ?? MAIN_BRANCH_ID})
    if (!created) return null

    await getMilestoneList()
    return created
  }

  async function updateMilestone(id: Milestone["id"], updates: Partial<Pick<Milestone, "name" | "date" | "description">>): Promise<Milestone | null> {
    const updated = await API.updateMilestone(id, updates)
    if (!updated) return null

    await getMilestoneList()
    return updated
  }

  async function deleteMilestone(id: Milestone["id"]): Promise<boolean> {
    const deleted = await API.deleteMilestone(id)
    if (!deleted) return false

    if (selectedMilestoneId.value === id) selectedMilestoneId.value = null

    await getMilestoneList()
    return true
  }

  watch(
    () => activeBranchId.value,
    (newId, oldId) => {
      if (newId === oldId) return

      selectedMilestoneId.value = null
      if (isMilestonesLoaded.value) getMilestoneList()
    },
  )

  return {
    isMilestonesLoaded,
    milestones,
    mode,
    selectedMilestoneId,

    getMilestoneList,
    setMode,
    selectMilestone,
    createMilestone,
    updateMilestone,
    deleteMilestone,
  }
})
