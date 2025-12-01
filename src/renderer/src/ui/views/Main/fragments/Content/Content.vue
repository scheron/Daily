<script setup lang="ts">
import {computed} from "vue"
import {useTasksStore} from "@/stores/tasks.store"
import {filterTasksByStatus} from "@/utils/tasks/filterTasksByStatus"

import BaseAnimation from "@/ui/base/BaseAnimation.vue"
import BaseSpinner from "@/ui/base/BaseSpinner.vue"
import {useFilterStore} from "@/ui/views/Main/model/filter.store"

import NoTasksCard from "./fragments/NoTasksCard.vue"
import TaskEditor from "./fragments/TaskEditor"
import TaskList from "./fragments/TaskList"

defineProps<{taskEditorOpen: boolean}>()
const emit = defineEmits<{createTask: []}>()

const tasksStore = useTasksStore()
const filterStore = useFilterStore()

const filteredTasks = computed(() => {
  return filterTasksByStatus(tasksStore.dailyTasks, filterStore.activeFilter).filter((task) => {
    if (!filterStore.activeTagIds.size) return true
    return task.tags.some((tag) => filterStore.activeTagIds.has(tag.id))
  })
})
</script>

<template>
  <div class="bg-base-200 flex-1 overflow-y-auto">
    <BaseAnimation name="fade" mode="out-in">
      <TaskEditor v-if="taskEditorOpen" />

      <div v-else class="size-full flex-1 overflow-y-auto">
        <BaseAnimation name="fade" mode="out-in">
          <BaseSpinner v-if="!tasksStore.isDaysLoaded" />
          <NoTasksCard
            v-else-if="!filteredTasks.length"
            :date="tasksStore.activeDay"
            :filter="filterStore.activeFilter"
            @create-task="emit('createTask')"
          />
          <TaskList v-else :key="String(tasksStore.activeDay + filterStore.activeFilter)" :tasks="filteredTasks" />
        </BaseAnimation>
      </div>
    </BaseAnimation>
  </div>
</template>
