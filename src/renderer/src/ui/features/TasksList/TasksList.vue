<script setup lang="ts">
import {computed} from "vue"
import {useFilterStore} from "@/stores/filter.store"
import {useTagsStore} from "@/stores/tags.store"
import {useTaskEditorStore} from "@/stores/taskEditor.store"
import {useTasksStore} from "@/stores/tasks.store"

import type {Tag, Task, TaskStatus} from "@/types/tasks"

import BaseAnimation from "@/ui/base/BaseAnimation.vue"
import BaseSpinner from "@/ui/base/BaseSpinner.vue"

import EmptyState from "./fragments/EmptyState.vue"
import TaskItem from "./fragments/TaskItem.vue"

const tasksStore = useTasksStore()
const tagsStore = useTagsStore()
const taskEditorStore = useTaskEditorStore()
const filterStore = useFilterStore()

const filteredTasks = computed(() => {
  const filter = filterStore.activeFilter

  return tasksStore.dailyTasks
    .filter((task) => {
      if (filter === "all") return true
      if (filter === "active") return task.status === "active"
      if (filter === "done") return task.status === "done"
      if (filter === "discarded") return task.status === "discarded"
    })
    .filter((task) => {
      if (!filterStore.activeTagNames.size) return true
      return task.tags.some((tag) => filterStore.activeTagNames.has(tag.name))
    })
})

function getTaskTags(task: Task): Tag[] {
  return task.tags.map((tag) => tagsStore.tagsMap.get(tag.name)).filter(Boolean) as Tag[]
}

function onEdit(task?: Task) {
  taskEditorStore.setCurrentEditingTask(task ?? null)
  taskEditorStore.setEditorTags(task?.tags ?? [])
  taskEditorStore.setIsTaskEditorOpen(true)
}

function onChangeStatus(task: Task, status: TaskStatus) {
  tasksStore.updateTask(task.id, {status})
}
</script>

<template>
  <div class="size-full flex-1 overflow-y-auto">
    <BaseAnimation name="fade" mode="out-in">
      <BaseSpinner v-if="!tasksStore.isDaysLoaded" />
      <EmptyState v-else-if="!filteredTasks.length" :date="tasksStore.activeDay" :filter="filterStore.activeFilter" @create-task="onEdit" />

      <div v-else :key="String(tasksStore.activeDay + filterStore.activeFilter)" class="flex flex-1 flex-col gap-2 p-2">
        <BaseAnimation name="fade" group mode="out-in">
          <TaskItem
            v-for="task in filteredTasks"
            :key="task.id"
            :task="task"
            :tags="getTaskTags(task)"
            @change-status="onChangeStatus(task, $event)"
            @edit="onEdit(task)"
          />
        </BaseAnimation>
      </div>
    </BaseAnimation>
  </div>
</template>
