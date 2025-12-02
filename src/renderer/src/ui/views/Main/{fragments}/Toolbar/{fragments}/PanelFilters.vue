<script lang="ts" setup>
import {computed, watch} from "vue"

import {removeDuplicates} from "@shared/utils/arrays/removeDuplicates"
import {useTasksStore} from "@/stores/tasks.store"
import BaseButton from "@/ui/base/BaseButton.vue"
import BaseIcon, {IconName} from "@/ui/base/BaseIcon"
import DynamicTagsPanel from "@/ui/common/misc/DynamicTagsPanel.vue"

import {useFilterStore} from "@MainView/stores/filter.store"
import {countTasks} from "../utils/countTasks"

import type {TasksFilter} from "@/types/common"
import type {Tag, Task} from "@shared/types/storage"

const FILTERS: {label: string; value: TasksFilter; icon: IconName}[] = [
  {label: "All", value: "all", icon: "today"},
  {label: "Active", value: "active", icon: "fire"},
  {label: "Discarded", value: "discarded", icon: "archive"},
  {label: "Done", value: "done", icon: "check-check"},
]

const tasksStore = useTasksStore()
const filterStore = useFilterStore()

const taskCounts = computed(() => countTasks(tasksStore.dailyTasks))

const filteredTags = computed(() => {
  const filter = filterStore.activeFilter

  const allTags = filterTasksByStatus(tasksStore.dailyTasks, filter).flatMap((task) => task.tags)

  return removeDuplicates(allTags, "name").sort((a, b) => a.name.localeCompare(b.name))
})

function filterTasksByStatus(tasks: Task[], filter: TasksFilter): Task[] {
  if (filter === "all") return tasks
  return tasks.filter((task) => task.status === filter)
}

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
      <BaseButton
        variant="ghost"
        :icon="filterStore.activeTagIds.size ? 'tags-off' : 'tags'"
        :class="{'hover:bg-accent/20': filterStore.activeTagIds.size}"
        icon-class="size-4"
        @click="filterStore.activeTagIds.size ? filterStore.clearActiveTags() : null"
      />

      <DynamicTagsPanel :tags="filteredTags" :selected-tags="filterStore.activeTagIds" empty-message="No daily tags" selectable @select="onSelectTag">
        <template #empty>
          <span class="text-base-content/70 text-sm"> No daily tags </span>
        </template>
      </DynamicTagsPanel>
    </div>

    <div class="flex w-full shrink-0 items-center gap-3 md:w-auto">
      <div class="bg-base-300 text-base-content inline-flex w-full gap-0.5 rounded-lg p-0.5 md:w-auto">
        <button
          v-for="option in FILTERS"
          :key="option.value"
          class="focus-visible-ring focus-visible:ring-offset-base-100 focus-visible:ring-accent inline-flex flex-1 items-center justify-center gap-x-1.5 rounded-md px-2 py-0.5 text-sm transition-colors outline-none md:flex-none"
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
            class="flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-xs"
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
