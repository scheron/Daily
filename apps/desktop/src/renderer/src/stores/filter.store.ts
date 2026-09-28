import {computed, ref, shallowRef, watch} from "vue"
import {defineStore, storeToRefs} from "pinia"

import {useMilestonesStore} from "@/stores/milestones.store"
import {useSettingsStore} from "@/stores/settings.store"

import type {Milestone, Tag} from "@daily/protocol"

type MilestoneScope = {kind: "all"} | {kind: "none"} | {kind: "milestone"; id: Milestone["id"]}

export const useFilterStore = defineStore("filter", () => {
  const settingsStore = useSettingsStore()
  const {settings} = storeToRefs(settingsStore)
  const milestonesStore = useMilestonesStore()
  const {milestonesMap, isMilestonesLoaded} = storeToRefs(milestonesStore)

  const activeTagIds = ref<Set<Tag["id"]>>(new Set())
  const milestoneScope = shallowRef<MilestoneScope>({kind: "all"})

  const frame = ref<"day" | "milestone">("day")

  const activeBranchId = computed(() => settings.value?.branch?.activeId)
  const activeMilestoneId = computed(() => (milestoneScope.value.kind === "milestone" ? milestoneScope.value.id : null))
  const isNoMilestoneActive = computed(() => milestoneScope.value.kind === "none")

  function setActiveTags(id: Tag["id"]) {
    if (activeTagIds.value.has(id)) activeTagIds.value.delete(id)
    else activeTagIds.value.add(id)
  }

  function removeActiveTag(id: Tag["id"]) {
    activeTagIds.value.delete(id)
  }

  function clearActiveTags() {
    activeTagIds.value.clear()
  }

  function setActiveMilestone(id: Milestone["id"]) {
    milestoneScope.value = activeMilestoneId.value === id ? {kind: "all"} : {kind: "milestone", id}
  }

  /** Frames the tasks that belong to no milestone; a second call returns to every milestone. */
  function toggleNoMilestone() {
    milestoneScope.value = isNoMilestoneActive.value ? {kind: "all"} : {kind: "none"}
  }

  function clearActiveMilestone() {
    milestoneScope.value = {kind: "all"}
  }

  function setFrame(next: "day" | "milestone") {
    frame.value = next
  }

  watch(activeBranchId, (newId, oldId) => {
    if (oldId === undefined) return
    if (newId !== oldId) clearActiveMilestone()
  })

  watch(milestonesMap, (map) => {
    if (!isMilestonesLoaded.value) return
    if (activeMilestoneId.value && !map.has(activeMilestoneId.value)) clearActiveMilestone()
  })

  return {
    activeTagIds,
    activeMilestoneId,
    isNoMilestoneActive,
    frame,

    removeActiveTag,
    setActiveTags,
    clearActiveTags,
    setActiveMilestone,
    toggleNoMilestone,
    setFrame,
  }
})
