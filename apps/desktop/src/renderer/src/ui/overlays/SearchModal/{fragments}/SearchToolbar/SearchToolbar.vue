<script setup lang="ts">
import BaseButton from "@/ui/base/BaseButton"
import SearchInput from "./{fragments}/SearchInput.vue"

import type {TasksFilter} from "../../types"

const TASK_FILTERS = [
  {value: "all", icon: "today", variant: "ghost-muted", activeVariant: "soft"},
  {value: "active", icon: "fire", variant: "error-ghost", activeVariant: "error-soft"},
  {value: "discarded", icon: "archive", variant: "warning-ghost", activeVariant: "warning-soft"},
  {value: "done", icon: "check-check", variant: "success-ghost", activeVariant: "success-soft"},
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

function getFilterVariant(filter: (typeof TASK_FILTERS)[number]) {
  return filter.value === props.filterStatus ? filter.activeVariant : filter.variant
}
</script>

<template>
  <div class="flex items-center gap-4">
    <SearchInput :model-value="filterQuery" :loading="searching" @update:model-value="emit('update:filter-query', $event)" />

    <div v-if="hasItems" class="flex items-center gap-2 text-xs">
      <BaseButton
        v-for="filter in TASK_FILTERS"
        :key="filter.value"
        :variant="getFilterVariant(filter)"
        :icon="filter.icon"
        size="sm"
        @click="onSelectFilter(filter.value)"
      />
    </div>
  </div>
</template>
