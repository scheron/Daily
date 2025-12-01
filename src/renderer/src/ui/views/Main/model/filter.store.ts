import {ref} from "vue"
import {defineStore} from "pinia"

import type {TasksFilter} from "@/types/filters"
import type {Tag} from "@shared/types/storage"

export const useFilterStore = defineStore("filter", () => {
  const activeFilter = ref<TasksFilter>("all")
  const activeTagIds = ref<Set<Tag["id"]>>(new Set())

  function setActiveFilter(filter: TasksFilter) {
    activeFilter.value = filter
  }

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

  return {
    activeFilter,
    activeTagIds,

    removeActiveTag,
    setActiveFilter,
    setActiveTags,
    clearActiveTags,
  }
})
