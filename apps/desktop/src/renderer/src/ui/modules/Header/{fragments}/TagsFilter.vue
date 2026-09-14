<script lang="ts" setup>
import {computed, watch} from "vue"

import {sortTags} from "@daily/protocol"
import {removeDuplicates} from "@daily/std"

import {useFilterStore} from "@/stores/filter.store"
import {useMilestonesStore} from "@/stores/milestones.store"
import {useTasksStore} from "@/stores/tasks"
import DynamicTagsPanel from "@/ui/common/misc/DynamicTagsPanel.vue"

import type {Tag} from "@daily/protocol"

const tasksStore = useTasksStore()
const filterStore = useFilterStore()
const milestonesStore = useMilestonesStore()

const milestoneFrameTasks = computed(() => {
  const ids = filterStore.activeMilestoneId ? [filterStore.activeMilestoneId] : milestonesStore.activeMilestones.map((milestone) => milestone.id)
  return ids.flatMap((id) => tasksStore.tasksByMilestoneId.get(id) ?? [])
})

const filteredTags = computed(() =>
  sortTags(
    removeDuplicates(
      (filterStore.frame === "milestone" ? milestoneFrameTasks.value : tasksStore.dailyTasks).flatMap((task) => task.tags),
      "name",
    ),
  ),
)

function onSelectTag(name: Tag["name"]) {
  filterStore.setActiveTags(name)
}

watch(
  () => [tasksStore.activeDay, filterStore.activeMilestoneId],
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
