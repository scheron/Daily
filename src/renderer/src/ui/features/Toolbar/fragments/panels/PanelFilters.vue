<script lang="ts" setup>
import {computed, watch} from "vue"

import {capitalize} from "@/utils/strings"
import {useFilterStore} from "@/stores/filter.store"
import {useTasksStore} from "@/stores/tasks.store"
import BaseButton from "@/ui/base/BaseButton.vue"
import BaseIcon from "@/ui/base/BaseIcon"
import BasePopup from "@/ui/base/BasePopup.vue"
import BaseTag from "@/ui/base/BaseTag.vue"

import type {TasksFilter} from "@/types/filters"
import type {Tag} from "@/types/tasks"

const VISIBLE_TAGS_COUNT = 3
const FILTERS: {label: string; value: TasksFilter}[] = [
  {label: "All", value: "all"},
  {label: "Active", value: "active"},
  {label: "Done", value: "done"},
  {label: "Discarded", value: "discarded"},
]

const tasksStore = useTasksStore()
const filterStore = useFilterStore()

const visibleTags = computed(() => tasksStore.dailyTags.slice(0, VISIBLE_TAGS_COUNT))
const remainingTags = computed(() => tasksStore.dailyTags.slice(VISIBLE_TAGS_COUNT))
const hasSelectedInPopup = computed(() => remainingTags.value.some((tag) => filterStore.activeTagIds.has(tag.id)))

const count = computed(() => {
  return tasksStore.dailyTasks.reduce(
    (acc, task) => {
      if (task.status === "active") acc.active++
      else if (task.status === "done") acc.done++
      else if (task.status === "discarded") acc.discarded++

      return acc
    },
    {active: 0, done: 0, discarded: 0},
  )
})

function isActiveTag(tagId: Tag["id"]) {
  return filterStore.activeTagIds.has(tagId)
}

function selectTag(tagId: Tag["id"]) {
  filterStore.setActiveTags(tagId)
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
    <div class="relative flex items-center gap-2 overflow-x-auto hide-scrollbar">
      <span v-if="!tasksStore.dailyTags.length" class="text-sm text-base-content/70">
        <BaseIcon name="tags" class="size-4" />
        No daily tags
      </span>

      <template v-else>
        <BasePopup v-if="remainingTags.length" title="More Tags">
          <template #trigger="{toggle}">
            <BaseButton
              variant="outline"
              size="sm"
              class="px-2 shrink-0 rounded-md"
              :class="[hasSelectedInPopup ? 'bg-accent/20 border-accent text-accent' : 'opacity-70 hover:opacity-90']"
              icon="tags"
              icon-class="size-3.5"
              @click="toggle"
            >
              <span class="text-xs font-medium">{{ remainingTags.length }}</span>
            </BaseButton>
          </template>

          <BaseButton
            v-for="tag in remainingTags"
            :key="tag.id"
            variant="ghost"
            size="sm"
            icon-class="size-4"
            :class="isActiveTag(tag.id) ? 'bg-base-200' : ''"
            @click="selectTag(tag.id)"
          >
            <span class="size-3 rounded-full shrink-0" :style="{backgroundColor: tag.color}" />
            <span class="text-sm truncate">{{ tag.name }}</span>
            <BaseIcon name="check" class="size-4 ml-auto text-base-content/70 shrink-0" :class="{invisible: !isActiveTag(tag.id)}" />
          </BaseButton>
        </BasePopup>

        <BaseTag v-for="tag in visibleTags" :key="tag.id" :tag="tag" :active="isActiveTag(tag.id)" @click="selectTag(tag.id)" />
      </template>
    </div>

    <div class="flex shrink-0 w-full items-center gap-3 md:w-auto">
      <div class="bg-base-300 text-base-content inline-flex w-full gap-2 rounded-lg p-0.5 md:w-auto">
        <button
          v-for="option in FILTERS"
          :key="option.value"
          class="focus-visible-ring focus-visible:ring-offset-base-100 focus-visible:ring-base-content flex-1 rounded-md px-2 py-0.5 text-sm transition-colors outline-none md:flex-none"
          :class="{
            'bg-base-100 text-base-content shadow-sm': filterStore.activeFilter === option.value,
            'text-base-content/70 hover:text-base-content': filterStore.activeFilter !== option.value,
          }"
          @click="filterStore.setActiveFilter(option.value)"
        >
          {{ capitalize(option.value) }}
          <span v-if="option.value !== 'all'" class="ml-1.5 text-xs">
            ({{ count[option.value as keyof typeof count] > 9 ? "9+" : count[option.value as keyof typeof count] }})
          </span>
        </button>
      </div>
    </div>
  </div>
</template>
