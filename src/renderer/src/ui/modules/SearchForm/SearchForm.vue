<script setup lang="ts">
import {toasts} from "vue-toasts-lite"

import {useBranchesStore} from "@/stores/branches.store"
import {useTasksStore} from "@/stores/tasks.store"
import {useUIStore} from "@/stores/ui.store"
import {useFilter} from "@/composables/useFilter"
import {useSearch} from "@/composables/useSearch"
import {highlightElement, scrollToElement} from "@/utils/ui/dom"
import BaseIcon from "@/ui/base/BaseIcon"

import {API} from "@/api"
import SearchResultItem from "./{fragments}/SearchResultItem.vue"
import SearchToolbar from "./{fragments}/SearchToolbar.vue"

import type {TaskSearchResult} from "@shared/types/search"
import type {TaskStatusFilter} from "./types"

const tasksStore = useTasksStore()
const branchesStore = useBranchesStore()
const uiStore = useUIStore()

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

async function navigateToTask(result: TaskSearchResult) {
  const task = result.task

  if (result.branch?.deletedAt) {
    toasts.error("Task belongs to a deleted project")
    return
  }

  if (branchesStore.activeBranchId !== task.branchId) {
    await branchesStore.setActiveBranch(task.branchId)
    await tasksStore.getTaskList()
  }

  tasksStore.setActiveDay(task.scheduled.date)

  const scrolled = await scrollToElement(task.id)
  if (scrolled) highlightElement(task.id, {class: "highlight", duration: 2000})

  uiStore.closeSearchModal()
}
</script>

<template>
  <div class="flex h-96 flex-col overflow-hidden px-4 py-1.5">
    <SearchToolbar v-model:filter-query="query" v-model:filter-status="filter" :searching="isSearching" :has-items="items.length > 0" />

    <div class="relative mt-4 flex-1 overflow-hidden">
      <div v-if="isLoaded && filteredItems.length" class="flex h-full flex-col gap-1 overflow-y-auto px-2 py-1.5">
        <SearchResultItem
          v-for="result in filteredItems"
          :key="result.task.id"
          :result="result"
          :search-query="query"
          @click="navigateToTask(result)"
        />
      </div>

      <div
        v-else-if="isLoaded && !filteredItems.length"
        class="text-base-content/50 absolute inset-0 flex flex-col items-center justify-center gap-3 text-center"
      >
        <BaseIcon name="empty" class="size-12" />
        <div class="space-y-1">
          <p class="text-sm font-medium">No tasks found</p>
          <p class="text-xs">Try a different search term</p>
        </div>
      </div>

      <div v-else class="text-base-content/60 absolute inset-0 flex flex-col items-center justify-center gap-3 text-center">
        <BaseIcon name="search" class="size-12" />
        <div class="space-y-1">
          <p class="text-sm font-medium">Search across all tasks</p>
        </div>
      </div>
    </div>
  </div>
</template>
