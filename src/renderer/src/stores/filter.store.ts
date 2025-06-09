import {ref} from "vue"
import {defineStore} from "pinia"

import type {TasksFilter} from "@/types/filters"

export const useFilterStore = defineStore("filter", () => {
  const activeFilter = ref<TasksFilter>("all")

  function setActiveFilter(filter: TasksFilter) {
    activeFilter.value = filter
  }

  return {
    activeFilter,
    setActiveFilter,
  }
})
