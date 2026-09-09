<script lang="ts" setup>
import {computed, watch} from "vue"

import {sortTags} from "@daily/protocol"
import {removeDuplicates} from "@daily/std"

import {useFilterStore} from "@/stores/filter.store"
import {useMilestonesStore} from "@/stores/milestones.store"
import {useTasksStore} from "@/stores/tasks"
import BaseButton from "@/ui/base/BaseButton"
import DynamicTagsPanel from "@/ui/common/misc/DynamicTagsPanel.vue"

import type {Milestone, Tag} from "@daily/protocol"

const tasksStore = useTasksStore()
const filterStore = useFilterStore()
const milestonesStore = useMilestonesStore()

const filteredTags = computed(() =>
  sortTags(
    removeDuplicates(
      tasksStore.dailyTasks.flatMap((task) => task.tags),
      "name",
    ),
  ),
)

const filteredMilestones = computed(() => {
  const presentMilestoneIds = new Set<Milestone["id"]>()
  for (const task of tasksStore.dailyTasks) {
    if (task.milestoneId) presentMilestoneIds.add(task.milestoneId)
  }
  return milestonesStore.milestones.filter((milestone) => presentMilestoneIds.has(milestone.id))
})

function onSelectTag(name: Tag["name"]) {
  filterStore.setActiveTags(name)
}

function onSelectMilestone(id: Milestone["id"]) {
  filterStore.setActiveMilestones(id)
}

watch(
  () => tasksStore.activeDay,
  () => {
    filterStore.clearActiveTags()
    filterStore.clearActiveMilestones()
  },
)

watch(filteredTags, (tags) => {
  if (!filterStore.activeTagIds.size) return

  const availableTagIds = new Set(tags.map((tag) => tag.id))

  for (const id of filterStore.activeTagIds) {
    if (!availableTagIds.has(id)) filterStore.removeActiveTag(id)
  }
})

watch(filteredMilestones, (milestones) => {
  if (!filterStore.activeMilestoneIds.size) return

  const availableMilestoneIds = new Set(milestones.map((milestone) => milestone.id))

  for (const id of filterStore.activeMilestoneIds) {
    if (!availableMilestoneIds.has(id)) filterStore.removeActiveMilestone(id)
  }
})
</script>

<template>
  <div class="flex min-w-0 items-center gap-2">
    <DynamicTagsPanel
      class="min-w-0 flex-1"
      :tags="filteredTags"
      :selected-tags="filterStore.activeTagIds"
      popup-hover-mode
      selectable
      size="md"
      @select="onSelectTag"
    />

    <div v-if="filteredMilestones.length" class="flex shrink-0 items-center gap-1.5">
      <BaseButton
        v-for="milestone in filteredMilestones"
        :key="milestone.id"
        variant="text"
        size="sm"
        icon="bookmark"
        icon-class="size-3.5"
        class="h-7 shrink-0 rounded-full px-2.5 py-1.5"
        :class="[filterStore.activeMilestoneIds.has(milestone.id) ? 'bg-accent/20 border-accent text-accent' : 'opacity-70 hover:opacity-90']"
        style="-webkit-app-region: no-drag"
        @click="onSelectMilestone(milestone.id)"
      >
        {{ milestone.name }}
      </BaseButton>
    </div>
  </div>
</template>
