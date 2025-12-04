<script setup lang="ts">
import {TaskSearchResult} from "@shared/types/search"
import {Task} from "@shared/types/storage"
import {useTasksStore} from "@/stores/tasks.store"
import {useFilter} from "@/composables/useFilter"
import {useSearch} from "@/composables/useSearch"
import {highlightElement, scrollToElement} from "@/utils/ui/dom"
import BaseIcon from "@/ui/base/BaseIcon"

import {API} from "@/api"
import SearchResultItem from "./{fragments}/SearchResultItem.vue"
import SearchToolbar from "./{fragments}/SearchToolbar.vue"
import {TaskStatusFilter} from "../../types"

const tasksStore = useTasksStore()

const {query, items, isSearching, isLoaded, isIdle} = useSearch<TaskSearchResult>({
  searchFn: async (query) => await API.searchTasks(query),
  debounce: 300,
})

const {filter, filteredItems} = useFilter<TaskSearchResult, TaskStatusFilter>({
  initialValue: "all",
  items,
  filterFn: (item, filter) => {
    if (filter === "all") return true
    return item.task.status === filter
  },
})

async function navigateToTask(task: Task) {
  const date = task.scheduled.date
  tasksStore.setActiveDay(date)

  const scrolled = await scrollToElement(task.id)
  if (scrolled) highlightElement(task.id, {class: "highlight", duration: 2000})
}
</script>

<template>
  <div class="flex h-full flex-col px-4 py-1.5">
    <SearchToolbar v-model:filter-query="query" v-model:filter-status="filter" :searching="isSearching" />

    <div class="bg-base-300 my-1 h-px w-full" />

    <div v-if="isSearching" class="text-base-content/60 flex flex-1 flex-col items-center justify-center gap-3 text-center">
      <BaseIcon name="search" class="size-12 animate-bounce" />
      <p class="text-sm">Searching...</p>
    </div>

    <div v-if="isLoaded && filteredItems.length" class="flex flex-1 flex-col gap-1 overflow-y-auto px-1 py-1.5">
      <SearchResultItem
        v-for="result in filteredItems"
        :key="result.task.id"
        :result="result"
        :search-query="query"
        @click="navigateToTask(result.task)"
      />
    </div>

    <div
      v-else-if="isLoaded && !filteredItems.length"
      class="text-base-content/50 flex flex-1 flex-col items-center justify-center gap-3 text-center"
    >
      <BaseIcon name="empty" class="size-12" />
      <div class="space-y-1">
        <p class="text-sm font-medium">No tasks found</p>
        <p class="text-xs">Try a different search term</p>
      </div>
    </div>

    <div v-else-if="isIdle" class="text-base-content/60 flex flex-1 flex-col items-center justify-center gap-3 text-center">
      <BaseIcon name="search" class="size-12" />
      <div class="space-y-1">
        <p class="text-sm font-medium">Search across all tasks</p>
      </div>
    </div>
  </div>
</template>
