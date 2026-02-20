<script setup lang="ts">
import {computed, watch} from "vue"

import {Task} from "@shared/types/storage"
import {useFilterStore} from "@/stores/filter.store"
import {useTaskEditorStore} from "@/stores/taskEditor.store"
import {useTasksStore} from "@/stores/tasks.store"
import {useUIStore} from "@/stores/ui.store"
import {scrollToElement} from "@/utils/ui/dom"
import BaseModal from "@/ui/base/BaseModal.vue"
import BaseSpinner from "@/ui/base/BaseSpinner.vue"
import TaskEditorCard from "@/ui/modules/TaskEditorCard"

import BoardMode from "./{fragments}/modes/BoardMode.vue"
import ListMode from "./{fragments}/modes/ListMode.vue"
import NoTasksPlaceholder from "./{fragments}/NoTasksPlaceholder.vue"

import type {TasksFilter} from "@/types/common"

defineProps<{taskEditorOpen: boolean}>()
const emit = defineEmits<{createTask: []}>()

const tasksStore = useTasksStore()
const filterStore = useFilterStore()
const taskEditorStore = useTaskEditorStore()
const uiStore = useUIStore()

const listTasks = computed(() => {
  return filterTasksByStatus(tasksStore.dailyTasks, filterStore.activeFilter).filter((task) => {
    if (!filterStore.activeTagIds.size) return true
    return task.tags.some((tag) => filterStore.activeTagIds.has(tag.id))
  })
})
const boardTasks = computed(() => {
  return tasksStore.dailyTasks.filter((task) => {
    if (!filterStore.activeTagIds.size) return true
    return task.tags.some((tag) => filterStore.activeTagIds.has(tag.id))
  })
})
const hasBoardTasks = computed(() => boardTasks.value.length > 0)

const isDndDisabled = computed(() => taskEditorStore.isTaskEditorOpen)

function filterTasksByStatus(tasks: Task[], filter: TasksFilter): Task[] {
  if (filter === "all") return tasks
  return tasks.filter((task) => task.status === filter)
}

watch(
  () => taskEditorStore.isTaskEditorOpen,
  (isOpen) => {
    if (uiStore.tasksViewMode === "columns") return

    if (isOpen) {
      const editorId = taskEditorStore.currentEditingTask ? `task-editor-${taskEditorStore.currentEditingTask.id}` : "task-editor-new-task"
      scrollToElement(editorId, {behavior: "instant", block: "nearest"})
    }
  },
)
</script>

<template>
  <div class="app-content bg-base-200 flex-1" :class="uiStore.tasksViewMode === 'columns' ? 'overflow-hidden' : 'overflow-y-auto'">
    <BaseSpinner v-if="!tasksStore.isDaysLoaded" />
    <NoTasksPlaceholder
      v-else-if="uiStore.tasksViewMode === 'list' && !listTasks.length && !taskEditorOpen"
      :date="tasksStore.activeDay"
      :filter="filterStore.activeFilter"
      @create-task="emit('createTask')"
    />
    <NoTasksPlaceholder
      v-else-if="uiStore.tasksViewMode === 'columns' && !hasBoardTasks && !taskEditorOpen"
      :date="tasksStore.activeDay"
      filter="all"
      @create-task="emit('createTask')"
    />
    <ListMode v-else-if="uiStore.tasksViewMode === 'list'" :tasks="listTasks" :dnd-disabled="isDndDisabled" />
    <BoardMode v-else :tasks="boardTasks" :dnd-disabled="isDndDisabled" />

    <BaseModal
      v-if="uiStore.tasksViewMode === 'columns'"
      :open="taskEditorStore.isTaskEditorOpen"
      hide-header
      container-class="h-auto w-[min(780px,94vw)] max-h-[84vh] rounded-xl"
      content-class="!p-0 overflow-hidden h-full flex flex-col"
      :z-index="2"
      @close="taskEditorStore.setIsTaskEditorOpen(false)"
    >
      <TaskEditorCard />
    </BaseModal>
  </div>
</template>
