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
import NoTasksCard from "./{fragments}/NoTasksCard.vue"
import {TaskCard} from "./{fragments}/TaskCard"

defineProps<{taskEditorOpen: boolean}>()
const emit = defineEmits<{createTask: []}>()

const tasksStore = useTasksStore()
const filterStore = useFilterStore()
const tagsStore = useTagsStore()
const taskEditorStore = useTaskEditorStore()

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

const isNewTaskEditing = computed(() => taskEditorStore.isTaskEditorOpen && !taskEditorStore.currentEditingTask)

const newTaskPlaceholder = computed<Task | null>(() => {
  if (taskEditorStore.isTaskEditorOpen && !taskEditorStore.currentEditingTask) {
    return {
      id: "new-task",
      content: "",
      status: "active",
      tags: [],
      estimatedTime: 0,
      spentTime: 0,
      deletedAt: null,
      attachments: [],
      scheduled: {
        date: tasksStore.activeDay,
        time: new Date().toTimeString().slice(0, 8),
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    } as Task
  }
  return null
})

function getTaskTags(task: Task): Tag[] {
  return task.tags.map((tag) => tagsStore.tagsMap.get(tag.id)).filter(Boolean) as Tag[]
}
</script>

<template>
  <div class="bg-base-200 flex-1 overflow-y-auto">
    <BaseAnimation name="fade" mode="out-in">
      <BaseSpinner v-if="!tasksStore.isDaysLoaded" />
      <NoTasksCard
        v-else-if="!filteredTasks.length && !taskEditorOpen"
        :date="tasksStore.activeDay"
        :filter="filterStore.activeFilter"
        @create-task="emit('createTask')"
      />

      <div v-else :key="String(tasksStore.activeDay + filterStore.activeFilter)" class="flex flex-1 flex-col gap-2 p-2">
        <template v-if="isNewTaskEditing && newTaskPlaceholder">
          <TaskCard :key="newTaskPlaceholder.id" :task="newTaskPlaceholder" :tags="[]" />
        </template>

        <BaseAnimation name="fade" group mode="out-in">
          <TaskCard v-for="task in filteredTasks" :key="task.id" :task="task" :tags="getTaskTags(task)" />
        </BaseAnimation>
      </div>
    </BaseAnimation>
  </div>
</template>
