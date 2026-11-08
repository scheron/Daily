<script setup lang="ts">
import {TASK_COLUMNS} from "@/constants/ui"
import BaseButton from "@/ui/base/BaseButton"
import SearchInput from "./{fragments}/SearchInput.vue"

import type {IconName} from "@/types/icons"
import type {TasksFilter} from "../../types"

const FILTER_VARIANTS = {
  all: {selected: "soft", unselected: "ghost-muted"},
  backlog: {selected: "filter-muted-selected", unselected: "ghost-muted"},
  ready_for_agent: {selected: "filter-error-selected", unselected: "filter-error"},
  todo: {selected: "filter-neutral-selected", unselected: "filter-neutral"},
  in_progress: {selected: "filter-primary-selected", unselected: "filter-primary"},
  ready_to_merge: {selected: "filter-info-selected", unselected: "filter-info"},
  done: {selected: "filter-success-selected", unselected: "filter-success"},
  cancelled: {selected: "filter-warning-selected", unselected: "filter-warning"},
} as const satisfies Record<TasksFilter, {selected: string; unselected: string}>

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

function getTaskFilters(): Array<{value: TasksFilter; label: string; icon: IconName}> {
  return [
    {value: "all", label: "All statuses", icon: "today"},
    ...TASK_COLUMNS.map((column) => ({value: column.status, label: column.label, icon: column.icon})),
  ]
}

function getFilterVariant(status: TasksFilter) {
  return status === props.filterStatus ? FILTER_VARIANTS[status].selected : FILTER_VARIANTS[status].unselected
}
</script>

<template>
  <div class="flex items-center gap-4">
    <SearchInput :model-value="filterQuery" :loading="searching" @update:model-value="emit('update:filter-query', $event)" />

    <div v-if="hasItems" class="flex items-center gap-2 text-xs">
      <BaseButton
        v-for="filter in getTaskFilters()"
        :key="filter.value"
        :variant="getFilterVariant(filter.value)"
        :aria-label="filter.label"
        :aria-pressed="filter.value === filterStatus"
        :tooltip="filter.label"
        :icon="filter.icon"
        size="sm"
        @click="onSelectFilter(filter.value)"
      />
    </div>
  </div>
</template>
