<script setup lang="ts">
import {computed, ref, watch} from "vue"
import VueDraggable from "vuedraggable"

import {deepClone} from "@shared/utils/common/deepClone"
import {useUIStore} from "@/stores/ui.store"
import {resolveMoveTarget, useTaskDragDrop} from "@/composables/useTaskDragDrop"
import BaseButton from "@/ui/base/BaseButton.vue"
import BaseIcon from "@/ui/base/BaseIcon"
import DynamicTagsPanel from "@/ui/common/misc/DynamicTagsPanel.vue"
import TaskCard from "@/ui/modules/TaskCard"

import type {IconName} from "@/ui/base/BaseIcon"
import type {TaskMoveMeta} from "@/utils/tasks/reorderTasks"
import type {MoveTaskByOrderParams, Tag, Task, TaskStatus} from "@shared/types/storage"

type BoardColumn = {
  status: TaskStatus
  label: string
  emptyLabel: string
  icon: IconName
  titleClass: string
  counterClass: string
}

const BOARD_COLUMNS: BoardColumn[] = [
  {status: "active", label: "Active", emptyLabel: "active", icon: "fire", titleClass: "text-error", counterClass: "bg-error/10 text-error"},
  {
    status: "discarded",
    label: "Discarded",
    emptyLabel: "discarded",
    icon: "archive",
    titleClass: "text-warning",
    counterClass: "bg-warning/10 text-warning",
  },
  {
    status: "done",
    label: "Done",
    emptyLabel: "completed",
    icon: "check-check",
    titleClass: "text-success",
    counterClass: "bg-success/10 text-success",
  },
]

const props = defineProps<{
  tasksByStatus: Record<TaskStatus, Task[]>
  tagsByStatus: Record<TaskStatus, Tag[]>
  getTaskTags: (task: Task) => Tag[]
  dndDisabled: boolean
  moveTaskByOrder: (params: MoveTaskByOrderParams) => Promise<TaskMoveMeta | null>
}>()

const uiStore = useUIStore()
const activeTagIdsByStatus = ref<Record<TaskStatus, Tag["id"][]>>({
  active: [],
  discarded: [],
  done: [],
})
const localTasksByStatus = ref<Record<TaskStatus, Task[]>>({
  active: [],
  discarded: [],
  done: [],
})
const pendingCrossColumnMove = ref<MoveTaskByOrderParams | null>(null)
const SORTABLE_ANIMATION_MS = 140
const {isDragging, isCommitting, isDragDisabled, onDragStart, onDragEnd, onDragOver, runWithCommit} = useTaskDragDrop({
  dndDisabled: () => props.dndDisabled,
  onDragEnd: flushPendingCrossColumnMove,
})
const visibleColumns = computed(() => BOARD_COLUMNS.filter((column) => !isColumnHidden(column.status)))
const filteredTasksByStatus = computed<Record<TaskStatus, Task[]>>(() => {
  return {
    active: getFilteredTasksByStatus("active"),
    discarded: getFilteredTasksByStatus("discarded"),
    done: getFilteredTasksByStatus("done"),
  }
})

function syncLocalTasks() {
  localTasksByStatus.value = {
    active: filteredTasksByStatus.value.active.map((task) => deepClone(task)),
    discarded: filteredTasksByStatus.value.discarded.map((task) => deepClone(task)),
    done: filteredTasksByStatus.value.done.map((task) => deepClone(task)),
  }
}

watch(
  filteredTasksByStatus,
  () => {
    if (isDragging.value || isCommitting.value) return
    syncLocalTasks()
  },
  {immediate: true},
)

function isColumnEmpty(status: TaskStatus) {
  return props.tasksByStatus[status].length === 0
}

function isColumnHidden(status: TaskStatus) {
  if (!uiStore.columnsHideEmpty) return false
  return isColumnEmpty(status)
}

function isColumnCollapsed(status: TaskStatus) {
  return Boolean(uiStore.columnsCollapsed[status])
}

function onToggleColumn(status: TaskStatus) {
  uiStore.toggleColumnCollapsed(status)
}

function onColumnDragEnter(status: TaskStatus) {
  if (!isDragging.value) return
  if (!isColumnCollapsed(status)) return

  uiStore.setColumnCollapsed(status, false)
}

function getSelectedTagIdsSet(status: TaskStatus) {
  return new Set(activeTagIdsByStatus.value[status])
}

function getFilteredTasksByStatus(status: TaskStatus) {
  const selectedTagIds = activeTagIdsByStatus.value[status]
  if (!selectedTagIds.length) return props.tasksByStatus[status]

  const selectedTagIdsSet = new Set(selectedTagIds)
  return props.tasksByStatus[status].filter((task) => task.tags.some((tag) => selectedTagIdsSet.has(tag.id)))
}

function onSelectTag(status: TaskStatus, id: Tag["id"]) {
  const selectedTagIds = activeTagIdsByStatus.value[status]
  if (selectedTagIds.includes(id)) {
    activeTagIdsByStatus.value[status] = selectedTagIds.filter((tagId) => tagId !== id)
    return
  }

  activeTagIdsByStatus.value[status] = [...selectedTagIds, id]
}

function flushPendingCrossColumnMove() {
  const pendingMove = pendingCrossColumnMove.value
  if (!pendingMove) return
  pendingCrossColumnMove.value = null

  setTimeout(() => commitColumnMove(pendingMove), SORTABLE_ANIMATION_MS + 16)
}

async function onColumnChange(status: TaskStatus, event: {added?: {newIndex: number}; moved?: {newIndex: number; oldIndex: number}}) {
  if (event.moved && event.moved.newIndex === event.moved.oldIndex) return
  if (!event.added && !event.moved) return

  const newIndex = event.added?.newIndex ?? event.moved?.newIndex
  if (newIndex === undefined) return

  const movedTask = localTasksByStatus.value[status][newIndex]
  if (!movedTask) return

  movedTask.status = status

  const {targetTaskId, position} = resolveMoveTarget(localTasksByStatus.value[status], newIndex)

  const moveParams = {
    taskId: movedTask.id,
    targetStatus: status,
    targetTaskId,
    position,
  } as MoveTaskByOrderParams

  if (event.added) {
    pendingCrossColumnMove.value = moveParams
    return
  }

  await commitColumnMove(moveParams)
}

async function commitColumnMove(params: MoveTaskByOrderParams) {
  await runWithCommit(async () => {
    const result = await props.moveTaskByOrder({
      taskId: params.taskId,
      mode: "column",
      targetStatus: params.targetStatus,
      targetTaskId: params.targetTaskId,
      position: params.position,
    })

    if (!result) {
      syncLocalTasks()
    }
  })
}
</script>

<template>
  <div class="h-full w-full overflow-x-auto overflow-y-hidden p-2" @dragover="onDragOver">
    <div class="flex h-full min-w-full gap-2">
      <div
        v-for="column in visibleColumns"
        :key="column.status"
        class="bg-base-100 border-base-300 flex h-full min-w-0 flex-col rounded-xl border"
        :class="isColumnCollapsed(column.status) ? 'max-w-20 min-w-20' : 'min-w-88 flex-1'"
        @dragenter="onColumnDragEnter(column.status)"
      >
        <template v-if="isColumnCollapsed(column.status)">
          <div class="flex h-full flex-col items-center justify-start gap-3 py-3">
            <BaseIcon :name="column.icon" class="size-4" :class="column.titleClass" />
            <span class="rounded-full px-2 py-0.5 text-xs font-semibold" :class="column.counterClass">
              {{ filteredTasksByStatus[column.status].length }}
            </span>
            <BaseButton variant="ghost" icon="chevron-right" tooltip="Expand column" class="size-6 p-0" @click="onToggleColumn(column.status)" />
          </div>
        </template>

        <template v-else>
          <div class="border-base-300 flex items-center justify-between border-b px-3 py-2">
            <div class="flex items-center gap-2" :class="column.titleClass">
              <BaseIcon :name="column.icon" class="size-4" />
              <span class="text-sm font-semibold">{{ column.label }}</span>
              <span class="rounded-full px-2 py-0.5 text-xs font-medium" :class="column.counterClass">
                {{ filteredTasksByStatus[column.status].length }}
              </span>
            </div>
            <BaseButton variant="ghost" icon="chevron-left" tooltip="Collapse column" class="size-6 p-0" @click="onToggleColumn(column.status)" />
          </div>

          <div class="border-base-300 border-b px-2 py-2">
            <DynamicTagsPanel
              :tags="tagsByStatus[column.status]"
              :selected-tags="getSelectedTagIdsSet(column.status)"
              empty-message="No tags"
              selectable
              @select="onSelectTag(column.status, $event)"
            />
          </div>

          <div class="relative flex min-w-0 flex-1 overflow-x-hidden overflow-y-auto p-2">
            <VueDraggable
              :list="localTasksByStatus[column.status]"
              item-key="id"
              group="daily-board"
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
              class="flex min-h-full w-full min-w-0 flex-col overflow-x-hidden"
              @start="onDragStart"
              @end="onDragEnd"
              @change="onColumnChange(column.status, $event)"
            >
              <template #item="{element: task}">
                <div class="relative mb-2 last:mb-0">
                  <div class="w-full shrink-0">
                    <TaskCard :task="task" :tags="getTaskTags(task)" view="columns" />
                  </div>
                </div>
              </template>
            </VueDraggable>

            <div
              v-if="!localTasksByStatus[column.status].length && !isDragging"
              class="text-base-content/70 pointer-events-none absolute inset-2 flex flex-col items-center justify-center gap-2 rounded-lg text-center"
            >
              <div class="bg-base-200 rounded-full p-3">
                <BaseIcon name="empty" class="size-5" />
              </div>
              <span class="text-sm">No {{ column.emptyLabel }} tasks</span>
            </div>
          </div>
        </template>
      </div>
    </div>
  </div>
</template>
