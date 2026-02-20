<script setup lang="ts">
import {computed, ref, watch} from "vue"
import VueDraggable from "vuedraggable"

import {sortTags} from "@shared/utils/tags/sortTags"
import {useTagsStore} from "@/stores/tags.store"
import {useTaskEditorStore} from "@/stores/taskEditor.store"
import {useTasksStore} from "@/stores/tasks.store"
import {resolveMoveTarget, useTaskDragDrop} from "@/composables/useTaskDragDrop"
import TaskCard from "@/ui/modules/TaskCard"
import TaskEditorCard from "@/ui/modules/TaskEditorCard"

import {DRAGGABLE_ATTRS, NEW_TASK_ID} from "../../model/constants"
import {createTaskPlaceholder} from "../../model/createTaskPlaceholder"

import type {Tag, Task} from "@shared/types/storage"

const props = defineProps<{tasks: Task[]; dndDisabled: boolean}>()

const tasksStore = useTasksStore()
const tagsStore = useTagsStore()
const taskEditorStore = useTaskEditorStore()

const draggableTasks = ref<Task[]>([])

const {isDragging, isCommitting, isDragDisabled, onDragStart, onDragEnd, onDragOver, runWithCommit} = useTaskDragDrop({
  dndDisabled: () => props.dndDisabled,
})

const isNewTaskEditing = computed(() => taskEditorStore.isTaskEditorOpen && !taskEditorStore.currentEditingTask)
const newTaskPlaceholder = computed<Task | null>(() => (isNewTaskEditing.value ? createTaskPlaceholder(tasksStore.activeDay) : null))

function isEditing(task: Task): boolean {
  if (!taskEditorStore.isTaskEditorOpen) return false
  if (task.id === NEW_TASK_ID && isNewTaskEditing.value) return true
  return taskEditorStore.currentEditingTask?.id === task.id
}

function getTaskTags(task: Task): Tag[] {
  const tags = task.tags.map((tag) => tagsStore.tagsMap.get(tag.id)).filter(Boolean) as Tag[]
  return sortTags(tags)
}

async function onListChange(event: {moved?: {newIndex: number; oldIndex: number}}) {
  if (!event.moved) return
  if (event.moved.newIndex === event.moved.oldIndex) return

  const movedTask = draggableTasks.value[event.moved.newIndex]
  if (!movedTask) return

  const {targetTaskId, position} = resolveMoveTarget(draggableTasks.value, event.moved.newIndex)
  const result = await runWithCommit(() =>
    tasksStore.moveTaskByOrder({
      taskId: movedTask.id,
      mode: "list",
      targetTaskId,
      position,
    }),
  )

  if (!result) {
    draggableTasks.value = [...props.tasks]
  }
}

watch(
  () => props.tasks,
  () => {
    if (isDragging.value || isCommitting.value) return
    draggableTasks.value = [...props.tasks]
  },
  {immediate: true},
)
</script>

<template>
  <div class="flex flex-1 flex-col gap-2 p-2" @dragover="onDragOver">
    <template v-if="isNewTaskEditing && newTaskPlaceholder">
      <TaskEditorCard v-if="isEditing(newTaskPlaceholder)" />
      <TaskCard v-else :key="newTaskPlaceholder.id" :task="newTaskPlaceholder" :tags="[]" />
    </template>

    <template v-if="dndDisabled">
      <template v-for="task in tasks" :key="task.id">
        <TaskEditorCard v-if="isEditing(task)" />
        <TaskCard v-else :task="task" :tags="getTaskTags(task)" />
      </template>
    </template>

    <VueDraggable
      v-else
      v-model="draggableTasks"
      item-key="id"
      :disabled="isDragDisabled"
      v-bind="DRAGGABLE_ATTRS"
      @start="onDragStart"
      @end="onDragEnd"
      @change="onListChange"
    >
      <template #item="{element: task}">
        <div class="relative mb-2 last:mb-0">
          <div class="">
            <TaskCard :task="task" :tags="getTaskTags(task)" />
          </div>
        </div>
      </template>
    </VueDraggable>
  </div>
</template>
