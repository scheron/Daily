<script setup lang="ts">
import {computed} from "vue"

import {Tag, Task} from "@shared/types/storage"
import {useTagsStore} from "@/stores/tags.store"
import {useTasksStore} from "@/stores/tasks.store"
import BaseAnimation from "@/ui/base/BaseAnimation.vue"
import BaseSpinner from "@/ui/base/BaseSpinner.vue"

import {useFilterStore} from "@MainView/stores/filter.store"
import {TasksFilter} from "@/types/common"
import NoTasksCard from "./{fragments}/NoTasksCard.vue"
import {TaskCard} from "./{fragments}/TaskCard"
import TaskEditor from "./{fragments}/TaskEditor"

defineProps<{taskEditorOpen: boolean}>()
const emit = defineEmits<{createTask: []}>()

const tasksStore = useTasksStore()
const filterStore = useFilterStore()
const tagsStore = useTagsStore()

function filterTasksByStatus(tasks: Task[], filter: TasksFilter): Task[] {
  if (filter === "all") return tasks
  return tasks.filter((task) => task.status === filter)
}

const filteredTasks = computed(() => {
  return filterTasksByStatus(tasksStore.dailyTasks, filterStore.activeFilter).filter((task) => {
    if (!filterStore.activeTagIds.size) return true
    return task.tags.some((tag) => filterStore.activeTagIds.has(tag.id))
  })
})

function getTaskTags(task: Task): Tag[] {
  return task.tags.map((tag) => tagsStore.tagsMap.get(tag.id)).filter(Boolean) as Tag[]
}
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

          <div v-else :key="String(tasksStore.activeDay + filterStore.activeFilter)" class="flex flex-1 flex-col gap-2 p-2">
            <BaseAnimation name="fade" group mode="out-in">
              <TaskCard v-for="task in filteredTasks" :key="task.id" :task="task" :tags="getTaskTags(task)" />
            </BaseAnimation>
          </div>
        </BaseAnimation>
      </div>
    </BaseAnimation>
  </div>
</template>
