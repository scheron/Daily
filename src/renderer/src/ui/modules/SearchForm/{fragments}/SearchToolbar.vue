<script setup lang="ts">
import {TASK_FILTERS} from "@/constants/tasks"
import {cn} from "@/utils/ui/tailwindcss"
import BaseButton from "@/ui/base/BaseButton.vue"
import SearchInput from "@/ui/common/inputs/SearchInput.vue"
import AnimatedTabs from "@/ui/common/misc/AnimatedTabs"

import type {TasksFilter} from "@/types/common"

const props = defineProps<{
  filterQuery: string
  filterStatus: TasksFilter
  searching: boolean
  hasItems: boolean
}>()
const emit = defineEmits<{
  "update:filter-query": [value: string]
  "update:filter-status": [value: TasksFilter]
  "clear:filter-query": []
  "clear:filter-status": []
}>()

function onSelectFilter(filter: TasksFilter) {
  const status = filter === props.filterStatus ? "all" : filter
  emit("update:filter-status", status)
}
</script>

<template>
  <div class="flex items-center gap-4">
    <SearchInput
      :model-value="filterQuery"
      :loading="searching"
      focus-on-mount
      @update:model-value="$emit('update:filter-query', $event)"
      @clear="emit('clear:filter-query')"
    />

    <div v-if="hasItems" class="flex items-center gap-2 text-xs">
      <BaseButton
        v-for="filter in TASK_FILTERS"
        :key="filter.value"
        variant="text"
        :icon="filter.icon"
        class="size-7"
        icon-class="size-5"
        :class="[filter.value === filterStatus ? filter.activeClass : filter.inactiveClass]"
        @click="onSelectFilter(filter.value)"
      />
    </div>
  </div>
</template>
