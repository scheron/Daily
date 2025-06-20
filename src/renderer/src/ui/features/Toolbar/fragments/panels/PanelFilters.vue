<script lang="ts" setup>
import {computed, watch} from "vue"
import {useFilterStore} from "@/stores/filter.store"
import {useTasksStore} from "@/stores/tasks.store"

import type {TasksFilter} from "@/types/filters"
import type {Tag} from "@/types/tasks"

import BaseButton from "@/ui/base/BaseButton.vue"
import BaseIcon from "@/ui/base/BaseIcon"
import BasePopup from "@/ui/base/BasePopup.vue"
import BaseTag from "@/ui/base/BaseTag.vue"

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
    <div class="hide-scrollbar relative flex items-center gap-2 overflow-x-auto">
      <span v-if="!tasksStore.dailyTags.length" class="text-base-content/70 text-sm">
        <BaseIcon name="tags" class="size-4" />
        No daily tags
      </span>

      <template v-else>
        <BasePopup v-if="remainingTags.length" title="More Tags">
          <template #trigger="{toggle}">
            <BaseButton
              variant="outline"
              size="sm"
              class="shrink-0 rounded-md px-2"
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
            class="gap-0"
            icon-class="size-4"
            :class="isActiveTag(tag.id) ? 'bg-base-200' : ''"
            @click="selectTag(tag.id)"
          >
            <span class="mr-1 size-3 shrink-0 rounded-full" :style="{backgroundColor: tag.color}" />
            <span v-if="tag.emoji" class="mr-1 text-xs">{{ tag.emoji }}</span>
            <span v-else class="text-base leading-0">#</span>
            <span class="truncate text-sm">{{ tag.name }}</span>
            <BaseIcon name="check" class="text-base-content/70 ml-auto size-4 shrink-0" :class="{invisible: !isActiveTag(tag.id)}" />
          </BaseButton>
        </BasePopup>

        <BaseTag v-for="tag in visibleTags" :key="tag.id" :tag="tag" :active="isActiveTag(tag.id)" @click="selectTag(tag.id)" />
      </template>
    </div>

    <div class="flex w-full shrink-0 items-center gap-3 md:w-auto">
      <div class="bg-base-300 text-base-content inline-flex w-full gap-2 rounded-lg p-0.5 md:w-auto">
        <button
          v-for="option in FILTERS"
          :key="option.value"
          class="focus-visible-ring capitalize focus-visible:ring-offset-base-100 focus-visible:ring-base-content flex-1 rounded-md px-2 py-0.5 text-sm transition-colors outline-none md:flex-none"
          :class="{
            'bg-base-100 text-base-content shadow-sm': filterStore.activeFilter === option.value,
            'text-base-content/70 hover:text-base-content': filterStore.activeFilter !== option.value,
          }"
          @click="filterStore.setActiveFilter(option.value)"
        >
          {{ option.value }}
        </button>
      </div>
    </div>
  </div>
</template>
