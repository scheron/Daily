<script lang="ts" setup>
import {computed, watch} from "vue"

import {removeDuplicates} from "@shared/utils/arrays/removeDuplicates"
import {sortTags} from "@shared/utils/tags/sortTags"
import {useFilterStore} from "@/stores/filter.store"
import {useTasksStore} from "@/stores/tasks"
import DynamicTagsPanel from "@/ui/common/misc/DynamicTagsPanel.vue"

import type {Tag} from "@shared/types/storage"

const tasksStore = useTasksStore()
const filterStore = useFilterStore()

const filteredTags = computed(() =>
  sortTags(
    removeDuplicates(
      tasksStore.dailyTasks.flatMap((task) => task.tags),
      "name",
    ),
  ),
)

function onSelectTag(name: Tag["name"]) {
  filterStore.setActiveTags(name)
}

watch(
  () => tasksStore.activeDay,
  () => filterStore.clearActiveTags(),
)

watch(filteredTags, (tags) => {
  if (!filterStore.activeTagIds.size) return

  const availableTagIds = new Set(tags.map((tag) => tag.id))

  for (const id of filterStore.activeTagIds) {
    if (!availableTagIds.has(id)) filterStore.removeActiveTag(id)
  }
})
</script>

<template>
  <DynamicTagsPanel :tags="filteredTags" :selected-tags="filterStore.activeTagIds" popup-hover-mode selectable size="md" @select="onSelectTag" />
</template>
