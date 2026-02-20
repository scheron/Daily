<script setup lang="ts">
import {computed, ref, watch} from "vue"
import VueDraggable from "vuedraggable"

import {resolveMoveTarget, useTaskDragDrop} from "@/composables/useTaskDragDrop"
import TaskCard from "@/ui/modules/TaskCard"
import TaskEditorCard from "@/ui/modules/TaskEditorCard"

import type {TaskMoveMeta} from "@/utils/tasks/reorderTasks"
import type {MoveTaskByOrderParams, Tag, Task} from "@shared/types/storage"

const props = defineProps<{
  tasks: Task[]
  isNewTaskEditing: boolean
  newTaskPlaceholder: Task | null
  isEditing: (task: Task) => boolean
  getTaskTags: (task: Task) => Tag[]
  dndDisabled: boolean
  moveTaskByOrder: (params: MoveTaskByOrderParams) => Promise<TaskMoveMeta | null>
}>()

const draggableTasks = ref<Task[]>([])
const {isDragging, isCommitting, isDragDisabled, onDragStart, onDragEnd, onDragOver, runWithCommit} = useTaskDragDrop({
  dndDisabled: () => props.dndDisabled,
})
const isStaticMode = computed(() => props.dndDisabled)

watch(
  () => props.tasks,
  () => {
    if (isDragging.value || isCommitting.value) return
    draggableTasks.value = [...props.tasks]
  },
  {immediate: true},
)

async function onListChange(event: {moved?: {newIndex: number; oldIndex: number}}) {
  if (!event.moved) return
  if (event.moved.newIndex === event.moved.oldIndex) return

  const movedTask = draggableTasks.value[event.moved.newIndex]
  if (!movedTask) return

  const {targetTaskId, position} = resolveMoveTarget(draggableTasks.value, event.moved.newIndex)
  const result = await runWithCommit(() =>
    props.moveTaskByOrder({
      taskId: movedTask.id,
      mode: "list",
      targetTaskId,
      position,
    })
  )

  if (!result) {
    draggableTasks.value = [...props.tasks]
  }
}
</script>

<template>
  <div class="flex flex-1 flex-col gap-2 p-2" @dragover="onDragOver">
    <template v-if="isNewTaskEditing && newTaskPlaceholder">
      <TaskEditorCard v-if="isEditing(newTaskPlaceholder)" />
      <TaskCard v-else :key="newTaskPlaceholder.id" :task="newTaskPlaceholder" :tags="[]" />
    </template>

    <template v-if="isStaticMode">
      <template v-for="task in tasks" :key="task.id">
        <TaskEditorCard v-if="isEditing(task)" />
        <TaskCard v-else :task="task" :tags="getTaskTags(task)" />
      </template>
    </template>

    <VueDraggable
      v-else
      v-model="draggableTasks"
      item-key="id"
      filter="[data-draggable-task-ignore], [data-draggable-task-ignore] *, button, a, input, textarea, select, [role='button']"
      :prevent-on-filter="false"
      :force-fallback="true"
      :fallback-on-body="true"
      :fallback-tolerance="2"
      ghost-class="draggable-task-ghost"
      chosen-class="draggable-task-chosen"
      drag-class="draggable-task-dragging"
      :animation="140"
      :disabled="isDragDisabled"
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
