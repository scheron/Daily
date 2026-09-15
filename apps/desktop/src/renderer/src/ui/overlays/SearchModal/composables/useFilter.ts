import {computed, ref} from "vue"

import type {TaskSearchResult} from "@daily/protocol"
import type {Ref} from "vue"
import type {TasksFilter} from "../types"

export function useFilter(items: Ref<TaskSearchResult[]>) {
  const filter = ref<TasksFilter>("all")

  const filteredItems = computed(() => items.value.filter((item) => filter.value === "all" || item.task.status === filter.value))

  return {
    filter,
    filteredItems,
  }
}
