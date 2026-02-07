<script setup lang="ts">
import {computed} from "vue"

import {Tag, Task} from "@shared/types/storage"
import {useTagsStore} from "@/stores/tags.store"
import {useTasksStore} from "@/stores/tasks.store"
import BaseAnimation from "@/ui/base/BaseAnimation.vue"
import BaseSpinner from "@/ui/base/BaseSpinner.vue"

import {useFilterStore} from "@MainView/stores/filter.store"
import {useTaskEditorStore} from "@MainView/stores/taskEditor.store"
import {TasksFilter} from "@/types/common"
import NoTasksPlaceholder from "./{fragments}/NoTasksPlaceholder.vue"
import TaskCard from "./{fragments}/TaskCard"
import {TaskEditorCard} from "./{fragments}/TaskEditorCard"
import {createTaskPlaceholder, NEW_TASK_ID} from "./model/constants"

defineProps<{taskEditorOpen: boolean}>()
const emit = defineEmits<{createTask: []}>()

const tasksStore = useTasksStore()
const filterStore = useFilterStore()
const tagsStore = useTagsStore()
const taskEditorStore = useTaskEditorStore()

const filteredTasks = computed(() => {
  return filterTasksByStatus(tasksStore.dailyTasks, filterStore.activeFilter).filter((task) => {
    if (!filterStore.activeTagIds.size) return true
    return task.tags.some((tag) => filterStore.activeTagIds.has(tag.id))
  })
})

const isNewTaskEditing = computed(() => taskEditorStore.isTaskEditorOpen && !taskEditorStore.currentEditingTask)
const newTaskPlaceholder = computed<Task | null>(() => (isNewTaskEditing.value ? createTaskPlaceholder(tasksStore.activeDay) : null))

function isEditing(task: Task): boolean {
  if (!taskEditorStore.isTaskEditorOpen) return false
  if (task.id === NEW_TASK_ID && isNewTaskEditing.value) return true
  return taskEditorStore.currentEditingTask?.id === task.id
}

function filterTasksByStatus(tasks: Task[], filter: TasksFilter): Task[] {
  if (filter === "all") return tasks
  return tasks.filter((task) => task.status === filter)
}

function getTaskTags(task: Task): Tag[] {
  return task.tags.map((tag) => tagsStore.tagsMap.get(tag.id)).filter(Boolean) as Tag[]
}
</script>

<template>
  <div class="app-content bg-base-200 flex-1 overflow-y-auto">
    <BaseAnimation name="fade" mode="out-in">
      <BaseSpinner v-if="!tasksStore.isDaysLoaded" />
      <NoTasksPlaceholder
        v-else-if="!filteredTasks.length && !taskEditorOpen"
        :date="tasksStore.activeDay"
        :filter="filterStore.activeFilter"
        @create-task="emit('createTask')"
      />

      <div v-else :key="String(tasksStore.activeDay + filterStore.activeFilter)" class="flex flex-1 flex-col gap-2 p-2">
        <template v-if="isNewTaskEditing && newTaskPlaceholder">
          <TaskEditorCard v-if="isEditing(newTaskPlaceholder)" />
          <TaskCard v-else :key="newTaskPlaceholder.id" :task="newTaskPlaceholder" :tags="[]" />
        </template>

        <template v-for="task in filteredTasks" :key="task.id">
          <TaskEditorCard v-if="isEditing(task)" />
          <TaskCard v-else :key="task.id" :task="task" :tags="getTaskTags(task)" />
        </template>
      </div>
    </BaseAnimation>
  </div>
</template>
