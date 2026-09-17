<script setup lang="ts">
import {computed, watch} from "vue"
import {storeToRefs} from "pinia"

import {sortTags} from "@daily/protocol"
import {removeDuplicates} from "@daily/std"

import {useFilterStore} from "@/stores/filter.store"
import {useMilestonesStore} from "@/stores/milestones.store"
import {useTasksStore} from "@/stores/tasks"
import {useUIStore} from "@/stores/ui"
import BaseAnimation from "@/ui/base/BaseAnimation.vue"
import DynamicTagsPanel from "@/ui/common/misc/DynamicTagsPanel.vue"

import type {Tag} from "@daily/protocol"

const tasksStore = useTasksStore()
const filterStore = useFilterStore()
const milestonesStore = useMilestonesStore()
const uiStore = useUIStore()

const {activeDay} = storeToRefs(tasksStore)
const {activeMilestoneId} = storeToRefs(filterStore)

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

watch([activeDay, activeMilestoneId], () => filterStore.clearActiveTags())

watch(filteredTags, (tags) => {
  if (!filterStore.activeTagIds.size) return

  const availableTagIds = new Set(tags.map((tag) => tag.id))

  for (const id of filterStore.activeTagIds) {
    if (!availableTagIds.has(id)) filterStore.removeActiveTag(id)
  }
})
</script>

<template>
  <BaseAnimation name="fade" :duration="200">
    <div v-if="filteredTags.length && !uiStore.isCalendarDockExpanded" class="pointer-events-none absolute left-24 right-1/2 top-2 z-30 mr-28 flex">
      <DynamicTagsPanel
        :tags="filteredTags"
        :selected-tags="filterStore.activeTagIds"
        popup-hover-mode
        selectable
        size="md"
        row-class="dock-surface pointer-events-auto h-8.5 gap-1.5 rounded-full p-0.5 [-webkit-app-region:no-drag]"
        @select="onSelectTag"
      />
    </div>
  </BaseAnimation>
</template>
