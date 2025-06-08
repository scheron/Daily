<script setup lang="ts">
import {BaseAnimation, BaseSpinner} from "@daily/ui/base"

import {computed} from "vue"

import {useFilterStore} from "@/stores/filter.store"
import {useTaskEditorStore} from "@/stores/taskEditor.store"
import {useTasksStore} from "@/stores/tasks.store"
import EmptyState from "./fragments/EmptyState.vue"
import TaskItem from "./fragments/TaskItem.vue"

import type {Task} from "@daily/types/tasks"

const tasksStore = useTasksStore()
const taskEditorStore = useTaskEditorStore()
const filterStore = useFilterStore()

const filteredTasks = computed(() => {
  const filter = filterStore.activeFilter

  return tasksStore.dailyTasks.filter((task) => {
    if (filter === "all") return true
    if (filter === "active") return !task.done
    if (filter === "done") return task.done
  })
})

function onEdit(task?: Task) {
  taskEditorStore.setCurrentEditingTask(task ?? null)
  taskEditorStore.setIsTaskEditorOpen(true)
}

function onDelete(task: Task) {
  taskEditorStore.setCurrentEditingTask(task)
  taskEditorStore.setIsTaskDeleteConfirmOpen(true)
}

function onToggleDone(task: Task, done: boolean) {
  tasksStore.updateTask(task.id, {done})
}
</script>

<template>
  <div class="size-full flex-1 overflow-y-auto">
    <BaseAnimation name="fade" mode="out-in">
      <BaseSpinner v-if="!tasksStore.isDaysLoaded" />
      <EmptyState v-else-if="!filteredTasks.length" :date="tasksStore.activeDay" :filter="filterStore.activeFilter" @create-task="onEdit" />

      <div v-else :key="String(tasksStore.activeDay + filterStore.activeFilter)" class="flex flex-1 flex-col gap-2 p-1">
        <BaseAnimation name="fade" group mode="out-in">
          <TaskItem
            v-for="task in filteredTasks"
            :key="task.id"
            :task="task"
            @toggle-done="onToggleDone(task, $event)"
            @delete="onDelete(task)"
            @edit="onEdit(task)"
          />
        </BaseAnimation>
      </div>
    </BaseAnimation>
  </div>
</template>
