<script setup lang="ts">
import {computed, onBeforeUnmount, ref, watch} from "vue"
import draggable from "vuedraggable"

import {resolveVerticalScrollableAncestor, useDragAutoScroll} from "@/composables/useDragAutoScroll"
import TaskCard from "@/ui/modules/TaskCard"
import TaskEditorCard from "@/ui/modules/TaskEditorCard"

import type {TaskMoveMeta} from "@/utils/tasks/reorderTasks"
import type {Tag, Task} from "@shared/types/storage"

const props = defineProps<{
  tasks: Task[]
  isNewTaskEditing: boolean
  newTaskPlaceholder: Task | null
  isEditing: (task: Task) => boolean
  getTaskTags: (task: Task) => Tag[]
  dndDisabled: boolean
  moveTaskByOrder: (params: {
    taskId: Task["id"]
    mode: "list" | "column"
    targetTaskId?: Task["id"] | null
    targetStatus?: Task["status"]
    position?: "before" | "after"
  }) => Promise<TaskMoveMeta | null>
}>()

const isDragging = ref(false)
const isCommitting = ref(false)
const draggableTasks = ref<Task[]>([])
const autoScroll = useDragAutoScroll()

const isDragDisabled = computed(() => props.dndDisabled || isCommitting.value)
const isStaticMode = computed(() => props.dndDisabled)

watch(
  () => props.tasks,
  () => {
    if (isDragging.value || isCommitting.value) return
    draggableTasks.value = [...props.tasks]
  },
  {immediate: true},
)

function onDragStart() {
  isDragging.value = true
  window.addEventListener("dragover", onGlobalDragOver)
}

function onDragEnd() {
  isDragging.value = false
  window.removeEventListener("dragover", onGlobalDragOver)
  autoScroll.stop()
}

function onDragOver(event: DragEvent) {
  if (!isDragging.value) return
  autoScroll.update(resolveVerticalScrollableAncestor(event.target), event.clientY)
}

function onGlobalDragOver(event: DragEvent) {
  if (!isDragging.value) return
  autoScroll.update(resolveVerticalScrollableAncestor(event.target), event.clientY)
}

async function onListChange(event: {moved?: {newIndex: number; oldIndex: number}}) {
  if (!event.moved) return
  if (event.moved.newIndex === event.moved.oldIndex) return

  const movedTask = draggableTasks.value[event.moved.newIndex]
  if (!movedTask) return

  const nextTask = draggableTasks.value[event.moved.newIndex + 1] ?? null
  const targetTaskId = nextTask?.id ?? null
  const position = targetTaskId ? "before" : "after"

  isCommitting.value = true

  try {
    const result = await props.moveTaskByOrder({
      taskId: movedTask.id,
      mode: "list",
      targetTaskId,
      position,
    })

    if (!result) {
      draggableTasks.value = [...props.tasks]
    }
  } finally {
    isCommitting.value = false
  }
}

onBeforeUnmount(() => {
  window.removeEventListener("dragover", onGlobalDragOver)
  autoScroll.stop()
})
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

    <draggable
      v-else
      v-model="draggableTasks"
      item-key="id"
      filter="[data-task-dnd-ignore], [data-task-dnd-ignore] *, button, a, input, textarea, select, [role='button']"
      :prevent-on-filter="false"
      :force-fallback="true"
      :fallback-on-body="true"
      :fallback-tolerance="2"
      ghost-class="task-dnd-ghost"
      chosen-class="task-dnd-chosen"
      drag-class="task-dnd-dragging"
      :animation="140"
      :disabled="isDragDisabled"
      @start="onDragStart"
      @end="onDragEnd"
      @change="onListChange"
    >
      <template #item="{element: task}">
        <div class="task-dnd-item relative">
          <div class="">
            <TaskCard :task="task" :tags="getTaskTags(task)" />
          </div>
        </div>
      </template>
    </draggable>
  </div>
</template>

<style scoped>
.task-dnd-ghost {
  position: relative;
  border: 2px dashed color-mix(in oklab, var(--color-accent) 58%, transparent);
  border-radius: 0.9rem;
  background: color-mix(in oklab, var(--color-accent) 12%, transparent);
  box-shadow: inset 0 0 0 1px color-mix(in oklab, var(--color-accent) 24%, transparent);
}

.task-dnd-ghost > * {
  opacity: 0;
  pointer-events: none;
}

.task-dnd-dragging {
  opacity: 0.95;
}

.task-dnd-item {
  margin-bottom: 0.5rem;
}

.task-dnd-item:last-child {
  margin-bottom: 0;
}
</style>
