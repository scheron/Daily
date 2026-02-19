<script setup lang="ts">
import {TASK_FILTERS} from "@/constants/tasks"
import SearchInput from "@/ui/common/inputs/SearchInput.vue"
import AnimatedTabs from "@/ui/common/misc/AnimatedTabs"

import type {TasksFilter} from "@/types/common"

defineProps<{
  filterQuery: string
  filterStatus: TasksFilter
  searching: boolean
}>()
defineEmits<{
  "update:filter-query": [value: string]
  "update:filter-status": [value: TasksFilter]
  "clear:filter-query": []
  "clear:filter-status": []
}>()
</script>

<template>
  <div class="flex flex-col gap-4">
    <SearchInput
      :model-value="filterQuery"
      :loading="searching"
      focus-on-mount
      @update:model-value="$emit('update:filter-query', $event)"
      @clear="$emit('clear:filter-query')"
    />

    <div class="flex w-full items-center gap-2 text-xs">
      <span class="text-base-content/70 shrink-0">Filter by:</span>
      <AnimatedTabs
        :tab="filterStatus"
        :tabs="TASK_FILTERS.map((filter) => ({...filter, id: filter.value}))"
        tab-class="flex items-center justify-center gap-x-1.5 rounded-md px-2 py-0.5 text-xs transition-colors outline-none md:flex-none"
        class="w-full justify-between"
        @update:tab="$emit('update:filter-status', $event)"
      />
    </div>
  </div>
</template>
