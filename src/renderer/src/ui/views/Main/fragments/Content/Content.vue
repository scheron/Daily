<script setup lang="ts">
import {computed} from "vue"
import {useFilterStore} from "@/stores/filter.store"
import {useTasksStore} from "@/stores/tasks.store"
import {filterTasksByStatus} from "@/utils/tasks"

import BaseAnimation from "@/ui/base/BaseAnimation.vue"
import BaseSpinner from "@/ui/base/BaseSpinner.vue"
import TaskEditor from "@/ui/features/TaskEditor"

import ContentNoTasks from "./ContentNoTasks.vue"
import ContentTasksList from "./ContentTasksList.vue"

defineProps<{taskEditorOpen: boolean}>()
const emit = defineEmits<{createTask: []}>()

const tasksStore = useTasksStore()
const filterStore = useFilterStore()

const filteredTasks = computed(() => {
  const statusOrder = {active: 0, done: 1, discarded: 2}

  return filterTasksByStatus(tasksStore.dailyTasks, filterStore.activeFilter)
    .filter((task) => {
      if (!filterStore.activeTagNames.size) return true
      return task.tags.some((tag) => filterStore.activeTagNames.has(tag.name))
    })
    .sort((a, b) => statusOrder[a.status] - statusOrder[b.status])
})
</script>

<template>
  <div class="bg-base-200 flex-1 overflow-y-auto">
    <BaseAnimation name="fade" mode="out-in">
      <TaskEditor v-if="taskEditorOpen" />

      <div v-else class="size-full flex-1 overflow-y-auto">
        <BaseAnimation name="fade" mode="out-in">
          <BaseSpinner v-if="!tasksStore.isDaysLoaded" />
          <ContentNoTasks
            v-else-if="!filteredTasks.length"
            :date="tasksStore.activeDay"
            :filter="filterStore.activeFilter"
            @create-task="emit('createTask')"
          />
          <ContentTasksList v-else :key="String(tasksStore.activeDay + filterStore.activeFilter)" :tasks="filteredTasks" />
        </BaseAnimation>
      </div>
    </BaseAnimation>
  </div>
</template>
