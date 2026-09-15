<script setup lang="ts">
import BaseButton from "@/ui/base/BaseButton"
import {cn} from "@/utils/ui/tailwindcss"
import SearchInput from "./{fragments}/SearchInput.vue"

import type {TasksFilter} from "../../types"

const TASK_FILTERS = [
  {value: "all", icon: "today"},
  {value: "active", icon: "fire"},
  {value: "discarded", icon: "archive"},
  {value: "done", icon: "check-check"},
] as const

const props = defineProps<{
  filterQuery: string
  filterStatus: TasksFilter
  searching: boolean
  hasItems: boolean
}>()
const emit = defineEmits<{
  "update:filter-query": [value: string]
  "update:filter-status": [value: TasksFilter]
}>()

function onSelectFilter(filter: TasksFilter) {
  const status = filter === props.filterStatus ? "all" : filter
  emit("update:filter-status", status)
}

function getFilterClasses(value: "all" | "active" | "discarded" | "done") {
  if (value === props.filterStatus) {
    return cn(
      "size-7",
      {
        all: "bg-base-100 text-base-content",
        active: "bg-base-100 text-error bg-error/10",
        discarded: "bg-base-100 text-warning bg-warning/10",
        done: "bg-base-100 text-success bg-success/10",
      }[value],
    )
  }

  return cn(
    "size-7",
    {
      all: "text-base-content/70 hover:text-base-content",
      active: "text-error/70 hover:text-error",
      discarded: "text-warning/70 hover:text-warning",
      done: "text-success/70 hover:text-success",
    }[value],
  )
}
</script>

<template>
  <div class="flex items-center gap-4">
    <SearchInput :model-value="filterQuery" :loading="searching" @update:model-value="emit('update:filter-query', $event)" />

    <div v-if="hasItems" class="flex items-center gap-2 text-xs">
      <BaseButton
        v-for="filter in TASK_FILTERS"
        :key="filter.value"
        variant="text"
        :icon="filter.icon"
        icon-class="size-5"
        :class="getFilterClasses(filter.value)"
        @click="onSelectFilter(filter.value)"
      />
    </div>
  </div>
</template>
