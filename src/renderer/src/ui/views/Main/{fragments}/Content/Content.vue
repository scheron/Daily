<script setup lang="ts">
import {computed, watch} from "vue"

import {ISODate} from "@shared/types/common"
import {MoveTaskByOrderParams, Tag, Task, TaskStatus} from "@shared/types/storage"
import {removeDuplicates} from "@shared/utils/arrays/removeDuplicates"
import {sortTags} from "@shared/utils/tags/sortTags"
import {sortTasksByOrderIndex} from "@shared/utils/tasks/orderIndex"
import {useFilterStore} from "@/stores/filter.store"
import {useTagsStore} from "@/stores/tags.store"
import {useTaskEditorStore} from "@/stores/taskEditor.store"
import {useTasksStore} from "@/stores/tasks.store"
import {useUIStore} from "@/stores/ui.store"
import {scrollToElement} from "@/utils/ui/dom"
import BaseModal from "@/ui/base/BaseModal.vue"
import BaseSpinner from "@/ui/base/BaseSpinner.vue"
import TaskEditorCard from "@/ui/modules/TaskEditorCard"

import ContentBoardView from "./{fragments}/ContentBoardView.vue"
import ContentListView from "./{fragments}/ContentListView.vue"
import NoTasksPlaceholder from "./{fragments}/NoTasksPlaceholder.vue"

import type {TasksFilter} from "@/types/common"
import type {TaskMoveMeta} from "@/utils/tasks/reorderTasks"

defineProps<{taskEditorOpen: boolean}>()

const emit = defineEmits<{
  createTask: []
  taskMoved: [meta: TaskMoveMeta]
}>()

const tasksStore = useTasksStore()
const filterStore = useFilterStore()
const tagsStore = useTagsStore()
const taskEditorStore = useTaskEditorStore()
const uiStore = useUIStore()

const sortedDailyTasks = computed(() => sortTasksByOrderIndex(tasksStore.dailyTasks))

const listTasks = computed(() => {
  return filterTasksByStatus(sortedDailyTasks.value, filterStore.activeFilter).filter((task) => {
    if (!filterStore.activeTagIds.size) return true
    return task.tags.some((tag) => filterStore.activeTagIds.has(tag.id))
  })
})
const boardTasks = computed(() => {
  return sortedDailyTasks.value.filter((task) => {
    if (!filterStore.activeTagIds.size) return true
    return task.tags.some((tag) => filterStore.activeTagIds.has(tag.id))
  })
})
const hasBoardTasks = computed(() => boardTasks.value.length > 0)

const isNewTaskEditing = computed(() => taskEditorStore.isTaskEditorOpen && !taskEditorStore.currentEditingTask)
const newTaskPlaceholder = computed<Task | null>(() => (isNewTaskEditing.value ? createTaskPlaceholder(tasksStore.activeDay) : null))
const boardTasksByStatus = computed<Record<TaskStatus, Task[]>>(() => {
  return boardTasks.value.reduce(
    (acc, task) => {
      acc[task.status].push(task)
      return acc
    },
    {active: [], discarded: [], done: []} as Record<TaskStatus, Task[]>,
  )
})
const boardTagsByStatus = computed<Record<TaskStatus, Tag[]>>(() => {
  const rawTagsByStatus = sortedDailyTasks.value.reduce(
    (acc, task) => {
      acc[task.status].push(...task.tags)
      return acc
    },
    {active: [], discarded: [], done: []} as Record<TaskStatus, Tag[]>,
  )

  return {
    active: sortTags(removeDuplicates(rawTagsByStatus.active, "name")),
    discarded: sortTags(removeDuplicates(rawTagsByStatus.discarded, "name")),
    done: sortTags(removeDuplicates(rawTagsByStatus.done, "name")),
  }
})

const isDndDisabled = computed(() => taskEditorStore.isTaskEditorOpen)

async function moveTaskByOrder(params: MoveTaskByOrderParams) {
  const meta = await tasksStore.moveTaskByOrder(params)
  if (meta) emit("taskMoved", meta)
  return meta
}

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
  const tags = task.tags.map((tag) => tagsStore.tagsMap.get(tag.id)).filter(Boolean) as Tag[]
  return sortTags(tags)
}
const NEW_TASK_ID = "new-task"

function createTaskPlaceholder(date: ISODate): Task {
  return {
    id: NEW_TASK_ID,
    content: "",
    status: "active",
    orderIndex: Number.MAX_SAFE_INTEGER,
    tags: [],
    estimatedTime: 0,
    spentTime: 0,
    deletedAt: null,
    attachments: [],
    scheduled: {
      date,
      time: new Date().toTimeString().slice(0, 8),
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
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
    <ContentListView
      v-else-if="uiStore.tasksViewMode === 'list'"
      :tasks="listTasks"
      :is-new-task-editing="isNewTaskEditing"
      :new-task-placeholder="newTaskPlaceholder"
      :is-editing="isEditing"
      :get-task-tags="getTaskTags"
      :dnd-disabled="isDndDisabled"
      :move-task-by-order="moveTaskByOrder"
    />
    <ContentBoardView
      v-else
      :tasks-by-status="boardTasksByStatus"
      :tags-by-status="boardTagsByStatus"
      :get-task-tags="getTaskTags"
      :dnd-disabled="isDndDisabled"
      :move-task-by-order="moveTaskByOrder"
    />

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
