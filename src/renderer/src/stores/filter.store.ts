import {ref} from "vue"
import {defineStore} from "pinia"

import type {TasksFilter} from "@/types/filters"
import type {Tag} from "@/types/tasks"

export const useFilterStore = defineStore("filter", () => {
  const activeFilter = ref<TasksFilter>("all")
  const activeTagNames = ref<Set<Tag["name"]>>(new Set())

  function setActiveFilter(filter: TasksFilter) {
    activeFilter.value = filter
  }

  function setActiveTags(tagName: Tag["name"]) {
    if (activeTagNames.value.has(tagName)) activeTagNames.value.delete(tagName)
    else activeTagNames.value.add(tagName)
  }

  function removeActiveTag(tagName: Tag["name"]) {
    activeTagNames.value.delete(tagName)
  }

  function clearActiveTags() {
    activeTagNames.value.clear()
  }

  return {
    activeFilter,
    activeTagNames,

    removeActiveTag,
    setActiveFilter,
    setActiveTags,
    clearActiveTags,
  }
})
