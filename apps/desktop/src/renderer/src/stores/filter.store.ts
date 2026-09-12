import {ref, watch} from "vue"
import {defineStore} from "pinia"

import {useMilestonesStore} from "@/stores/milestones.store"
import {useSettingsStore} from "@/stores/settings.store"

import type {Milestone, Tag} from "@daily/protocol"

export const useFilterStore = defineStore("filter", () => {
  const settingsStore = useSettingsStore()
  const milestonesStore = useMilestonesStore()

  const activeTagIds = ref<Set<Tag["id"]>>(new Set())
  const activeMilestoneId = ref<Milestone["id"] | null>(null)

  const frame = ref<"day" | "milestone">("day")

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

  watch(
    () => settingsStore.settings?.branch?.activeId,
    (newId, oldId) => {
      if (oldId === undefined) return
      if (newId !== oldId) clearActiveMilestone()
    },
  )

  watch(
    () => milestonesStore.milestonesMap,
    (map) => {
      if (!milestonesStore.isMilestonesLoaded) return
      if (activeMilestoneId.value && !map.has(activeMilestoneId.value)) clearActiveMilestone()
    },
  )

  return {
    activeTagIds,
    activeMilestoneId,
    frame,

    removeActiveTag,
    setActiveTags,
    clearActiveTags,
    setActiveMilestone,
    clearActiveMilestone,
    setFrame,
  }
})
