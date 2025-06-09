<script setup lang="ts">
import {computed, ref, watch} from "vue"
import {useFilterStore} from "@/stores/filter.store"
import {useTaskEditorStore} from "@/stores/taskEditor.store"
import {useTasksStore} from "@/stores/tasks.store"
import draggable from "vuedraggable"

import type {Task} from "@/types/tasks"

import BaseAnimation from "@/ui/base/BaseAnimation.vue"
import BaseSpinner from "@/ui/base/BaseSpinner.vue"

import EmptyState from "./fragments/EmptyState.vue"
import TaskItem from "./fragments/TaskItem.vue"

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

const draggableTasks = ref<Task[]>([])

watch(
  filteredTasks,
  (val) => {
    draggableTasks.value = [...val]
  },
  {immediate: true},
)

async function onDragEnd(evt: {oldIndex: number; newIndex: number}) {
  const moved = draggableTasks.value[evt.oldIndex]
  const targetIndex = evt.newIndex

  let beforeTaskId: string | null = null

  if (targetIndex > 0) {
    beforeTaskId = draggableTasks.value[targetIndex].id
  }

  await tasksStore.moveTask(moved.id, beforeTaskId)
}

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
        <draggable
          v-model="draggableTasks"
          handle="[data-draggable-handle]"
          item-key="id"
          class="flex flex-col gap-2 p-1"
          @start="onDragStart"
          @end="onDragEnd"
        >
          <template #item="{element: task}">
            <TaskItem :task="task" @toggle-done="onToggleDone(task, $event)" @delete="onDelete(task)" @edit="onEdit(task)" />
          </template>
        </draggable>
      </div>
    </BaseAnimation>
  </div>
</template>
