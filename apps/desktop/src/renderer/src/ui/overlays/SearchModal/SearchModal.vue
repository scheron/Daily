<script setup lang="ts">
import {useTaskColumns} from "@/composables/tasks/useTaskColumns"
import BaseIcon from "@/ui/base/BaseIcon.vue"
import BaseModal from "@/ui/base/BaseModal.vue"
import {useFilter} from "./composables/useFilter"
import {useSearch} from "./composables/useSearch"
import {useSearchTaskNavigation} from "./composables/useSearchTaskNavigation"
import {highlightElement} from "./utils/highlightElement"
import SearchResultItem from "./{fragments}/SearchResultItem.vue"
import SearchToolbar from "./{fragments}/SearchToolbar"

import type {TaskSearchResult} from "@daily/protocol"

const emit = defineEmits<{
  close: []
}>()

const {query, items, isSearching, isLoaded} = useSearch()
const {filter, filteredItems} = useFilter(items)
const {prepareNavigation} = useSearchTaskNavigation()
const {revealTask} = useTaskColumns()

async function navigateToTask(result: TaskSearchResult) {
  const destination = await prepareNavigation(result)
  if (destination === null) return

  emit("close")

  if (destination === "board" && (await revealTask(result.task.id))) highlightElement(result.task.id)
}
</script>

<template>
  <BaseModal container-class="max-h-[70vh] w-[600px]" content-class="overflow-hidden" @close="emit('close')">
    <div class="flex h-full flex-col overflow-hidden px-4 py-1.5">
      <SearchToolbar v-model:filter-query="query" v-model:filter-status="filter" :searching="isSearching" :has-items="items.length > 0" />

      <div class="relative mt-4 flex-1 overflow-hidden">
        <div v-if="isLoaded && filteredItems.length" class="flex h-full flex-col gap-1 overflow-y-auto px-2 py-1.5">
          <SearchResultItem v-for="result in filteredItems" :key="result.task.id" :result="result" @click="navigateToTask(result)" />
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
  </BaseModal>
</template>
