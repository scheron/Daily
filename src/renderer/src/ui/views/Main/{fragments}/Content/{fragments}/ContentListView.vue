<script setup lang="ts">
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
</script>

<template>
  <div class="flex flex-1 flex-col gap-2 p-2">
    <template v-if="isNewTaskEditing && newTaskPlaceholder">
      <TaskEditorCard v-if="isEditing(newTaskPlaceholder)" />
      <TaskCard v-else :key="newTaskPlaceholder.id" :task="newTaskPlaceholder" :tags="[]" />
    </template>

    <template v-for="task in tasks" :key="task.id">
      <TaskEditorCard v-if="isEditing(task)" />
      <TaskCard v-else :key="task.id" :task="task" :tags="getTaskTags(task)" />
    </template>
  </div>
</template>
