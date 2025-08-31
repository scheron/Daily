<script lang="ts" setup>
import {computed, watch} from "vue"
import {useFilterStore} from "@/stores/filter.store"
import {useTasksStore} from "@/stores/tasks.store"
import {countTasks} from "@/utils/tasks"

import type {TasksFilter} from "@/types/filters"
import type {Tag} from "@/types/tasks"

import BaseIcon, {IconName} from "@/ui/base/BaseIcon"
import DynamicTagsPanel from "@/ui/common/panels/DynamicTagsPanel.vue"

const FILTERS: {label: string; value: TasksFilter; icon: IconName}[] = [
  {label: "All", value: "all", icon: "today"},
  {label: "Active", value: "active", icon: "fire"},
  {label: "Discarded", value: "discarded", icon: "archive"},
  {label: "Done", value: "done", icon: "check-check"},
]

const tasksStore = useTasksStore()
const filterStore = useFilterStore()

const taskCounts = computed(() => countTasks(tasksStore.dailyTasks))

function onSelectTag(name: Tag["name"]) {
  filterStore.setActiveTags(name)
}

watch(
  () => tasksStore.activeDay,
  () => {
    filterStore.clearActiveTags()
  },
)
</script>

<template>
  <div class="bg-base-100 flex size-full flex-col gap-3 px-4 py-2 md:flex-row md:items-center md:justify-between">
    <div class="relative flex w-full flex-1 items-center gap-2">
      <DynamicTagsPanel
        :tags="tasksStore.dailyTags"
        :selected-tags="filterStore.activeTagNames"
        empty-message="No daily tags"
        @select="onSelectTag"
      />
    </div>

    <div class="flex w-full shrink-0 items-center gap-3 md:w-auto">
      <div class="bg-base-300 text-base-content inline-flex w-full gap-0.5 rounded-lg p-0.5 md:w-auto">
        <button
          v-for="option in FILTERS"
          :key="option.value"
          class="focus-visible-ring focus-visible:ring-offset-base-100 focus-visible:ring-base-content inline-flex flex-1 items-center justify-center gap-x-1.5 rounded-md px-2 py-0.5 text-sm transition-colors outline-none md:flex-none"
          :class="{
            'bg-base-100 text-base-content shadow-sm': filterStore.activeFilter === option.value,
            'text-base-content/70 hover:text-base-content': filterStore.activeFilter !== option.value,
          }"
          @click="filterStore.setActiveFilter(option.value)"
        >
          <BaseIcon :name="option.icon" class="size-4" />
          <span class="text-sm">{{ option.label }}</span>
          <span
            v-if="option.value !== 'all'"
            class="flex h-4 min-w-[1rem] items-center justify-center rounded-full px-1 text-xs"
            :class="{
              'bg-base-300': filterStore.activeFilter === option.value,
              'bg-base-100 text-base-content/50': filterStore.activeFilter !== option.value,
            }"
          >
            {{ taskCounts[option.value] > 9 ? "9+" : taskCounts[option.value] }}
          </span>
        </button>
      </div>
    </div>
  </div>
</template>
