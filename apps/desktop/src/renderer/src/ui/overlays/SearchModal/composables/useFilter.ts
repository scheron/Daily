import {computed, ref, toValue} from "vue"

import type {TaskSearchResult} from "@daily/protocol"
import type {MaybeRefOrGetter} from "vue"
import type {TasksFilter} from "../types"

export function useFilter(items: MaybeRefOrGetter<TaskSearchResult[]>) {
  const filter = ref<TasksFilter>("all")

  const filteredItems = computed(() => toValue(items).filter((item) => filter.value === "all" || item.task.status === filter.value))

  return {
    filter,
    filteredItems,
  }
}
