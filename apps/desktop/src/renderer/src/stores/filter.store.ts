import {computed, ref, watch} from "vue"
import {defineStore, storeToRefs} from "pinia"

import {useMilestonesStore} from "@/stores/milestones.store"
import {useSettingsStore} from "@/stores/settings.store"

import type {Milestone, Tag} from "@daily/protocol"

export const useFilterStore = defineStore("filter", () => {
  const settingsStore = useSettingsStore()
  const {settings} = storeToRefs(settingsStore)
  const milestonesStore = useMilestonesStore()
  const {milestonesMap, isMilestonesLoaded} = storeToRefs(milestonesStore)

  const activeTagIds = ref<Set<Tag["id"]>>(new Set())
  const activeMilestoneId = ref<Milestone["id"] | null>(null)

  const frame = ref<"day" | "milestone">("day")

  const activeBranchId = computed(() => settings.value?.branch?.activeId)

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
    activeMilestoneId.value = activeMilestoneId.value === id ? null : id
  }

  function clearActiveMilestone() {
    activeMilestoneId.value = null
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
    frame,

    removeActiveTag,
    setActiveTags,
    clearActiveTags,
    setActiveMilestone,
    setFrame,
  }
})
