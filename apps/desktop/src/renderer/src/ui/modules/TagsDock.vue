<script setup lang="ts">
import {computed, watch} from "vue"
import {storeToRefs} from "pinia"

import {sortTags} from "@daily/protocol"
import {removeDuplicates} from "@daily/std"

import {useFilterStore} from "@/stores/filter.store"
import {useProjectScopeStore} from "@/stores/projectScope.store"
import {useTasksStore} from "@/stores/tasks"
import {useUIStore} from "@/stores/ui"
import BaseAnimation from "@/ui/base/BaseAnimation.vue"
import DynamicTagsPanel from "@/ui/common/misc/DynamicTagsPanel.vue"
import {getActiveTagNames} from "@/utils/tags/getActiveTagNames"

import type {Tag} from "@daily/protocol"

const tasksStore = useTasksStore()
const filterStore = useFilterStore()
const projectScopeStore = useProjectScopeStore()
const uiStore = useUIStore()

const {activeDay} = storeToRefs(tasksStore)
const {activeMilestoneId, isNoMilestoneActive} = storeToRefs(filterStore)

const milestoneFrameTasks = computed(() => {
  if (filterStore.isNoMilestoneActive) return tasksStore.tasksWithoutMilestone
  if (filterStore.activeMilestoneId) return tasksStore.tasksByMilestoneId.get(filterStore.activeMilestoneId) ?? []
  return tasksStore.projectTasks
})

const dayFrameTasks = computed(() => tasksStore.dailyTasks.concat(tasksStore.backlogTasks))

const filteredTags = computed(() => {
  const tags = (filterStore.frame === "milestone" ? milestoneFrameTasks.value : dayFrameTasks.value).flatMap((task) => task.tags)
  return sortTags(removeDuplicates(tags, "name"))
})

const activeTagNames = computed(() => getActiveTagNames(tasksStore.projectTasks, filterStore.activeTagIds))

const selectedChipIds = computed<Set<Tag["id"]>>(() => {
  if (!projectScopeStore.isAllProjectsMode) return filterStore.activeTagIds
  return new Set(filteredTags.value.filter((tag) => activeTagNames.value.has(tag.name)).map((tag) => tag.id))
})

function onSelectTag(id: Tag["id"]) {
  const chip = filteredTags.value.find((tag) => tag.id === id)
  if (!projectScopeStore.isAllProjectsMode || !chip || !activeTagNames.value.has(chip.name)) {
    filterStore.setActiveTags(id)
    return
  }

  const nameById = new Map(tasksStore.projectTasks.flatMap((task) => task.tags).map((tag) => [tag.id, tag.name]))
  for (const activeId of [...filterStore.activeTagIds]) {
    if (nameById.get(activeId) === chip.name) filterStore.removeActiveTag(activeId)
  }
}

watch([activeDay, activeMilestoneId, isNoMilestoneActive], () => filterStore.clearActiveTags())

watch(filteredTags, (tags) => {
  if (!filterStore.activeTagIds.size) return

  if (projectScopeStore.isAllProjectsMode) {
    const availableNames = new Set(tags.map((tag) => tag.name))
    const nameById = new Map(tasksStore.projectTasks.flatMap((task) => task.tags).map((tag) => [tag.id, tag.name]))
    for (const id of filterStore.activeTagIds) {
      const name = nameById.get(id)
      if (!name || !availableNames.has(name)) filterStore.removeActiveTag(id)
    }
    return
  }

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
        :selected-tags="selectedChipIds"
        popup-hover-mode
        selectable
        size="md"
        row-class="dock-surface pointer-events-auto h-8.5 gap-1.5 rounded-full p-0.5 [-webkit-app-region:no-drag]"
        @select="onSelectTag"
      />
    </div>
  </BaseAnimation>
</template>
