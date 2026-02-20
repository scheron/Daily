<script setup lang="ts">
import {useInjectedTaskDnd} from "@/composables/useTaskDnd"
import TaskCard from "@/ui/modules/TaskCard"
import TaskEditorCard from "@/ui/modules/TaskEditorCard"

import type {Tag, Task} from "@shared/types/storage"

defineProps<{
  tasks: Task[]
  isNewTaskEditing: boolean
  newTaskPlaceholder: Task | null
  isEditing: (task: Task) => boolean
  getTaskTags: (task: Task) => Tag[]
}>()

const taskDnd = useInjectedTaskDnd()
const listDropContext = {mode: "list"} as const
</script>

<template>
  <div class="flex flex-1 flex-col gap-2 p-2">
    <template v-if="isNewTaskEditing && newTaskPlaceholder">
      <TaskEditorCard v-if="isEditing(newTaskPlaceholder)" />
      <TaskCard v-else :key="newTaskPlaceholder.id" :task="newTaskPlaceholder" :tags="[]" />
    </template>

    <template v-for="task in tasks" :key="task.id">
      <TaskEditorCard v-if="isEditing(task)" />
      <div
        v-else
        class="relative"
        @dragover="taskDnd.onCardDragOver($event, task.id, listDropContext)"
        @drop="taskDnd.onCardDrop($event, task.id, listDropContext)"
      >
        <div
          v-if="taskDnd.isCardDropTarget(task.id, listDropContext, 'before')"
          class="border-accent/60 mb-2 h-2 rounded-md border-2 border-dashed"
        />
        <div
          draggable="true"
          class="cursor-grab active:cursor-grabbing"
          :class="{'opacity-45': taskDnd.isTaskDragging(task.id)}"
          @dragstart="taskDnd.onDragStart(task.id, $event)"
          @dragend="taskDnd.onDragEnd"
        >
          <TaskCard :key="task.id" :task="task" :tags="getTaskTags(task)" />
        </div>
        <div
          v-if="taskDnd.isCardDropTarget(task.id, listDropContext, 'after')"
          class="border-accent/60 mt-2 h-2 rounded-md border-2 border-dashed"
        />
      </div>
    </template>

    <div
      v-if="taskDnd.isDragging"
      class="border-base-300 mt-1 flex min-h-8 items-center justify-center rounded-lg border border-dashed text-xs transition-colors"
      :class="taskDnd.isContainerDropTarget(listDropContext) ? 'border-accent text-accent bg-accent/5' : 'text-base-content/45'"
      @dragover="taskDnd.onContainerDragOver($event, listDropContext)"
      @drop="taskDnd.onContainerDrop($event, listDropContext)"
    >
      Drop here to move to the end
    </div>
  </div>
</template>
