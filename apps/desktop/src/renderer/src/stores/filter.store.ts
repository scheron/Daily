import {ref} from "vue"
import {defineStore} from "pinia"

import type {Milestone, Tag} from "@daily/protocol"

export const useFilterStore = defineStore("filter", () => {
  const activeTagIds = ref<Set<Tag["id"]>>(new Set())
  const activeMilestoneIds = ref<Set<Milestone["id"]>>(new Set())

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

  function setActiveMilestones(id: Milestone["id"]) {
    if (activeMilestoneIds.value.has(id)) activeMilestoneIds.value.delete(id)
    else activeMilestoneIds.value.add(id)
  }

  function removeActiveMilestone(id: Milestone["id"]) {
    activeMilestoneIds.value.delete(id)
  }

  function clearActiveMilestones() {
    activeMilestoneIds.value.clear()
  }

  return {
    activeTagIds,
    activeMilestoneIds,

    removeActiveTag,
    setActiveTags,
    clearActiveTags,

    removeActiveMilestone,
    setActiveMilestones,
    clearActiveMilestones,
  }
})
