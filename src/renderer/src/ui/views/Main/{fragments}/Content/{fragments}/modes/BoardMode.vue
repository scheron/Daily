<script setup lang="ts">
import {computed, reactive, ref, watch} from "vue"
import VueDraggable from "vuedraggable"

import {removeDuplicates} from "@shared/utils/arrays/removeDuplicates"
import {deepClone} from "@shared/utils/common/deepClone"
import {sortTags} from "@shared/utils/tags/sortTags"
import {useTagsStore} from "@/stores/tags.store"
import {useTasksStore} from "@/stores/tasks.store"
import {useUIStore} from "@/stores/ui.store"
import {resolveMoveTarget, useTaskDragDrop} from "@/composables/useTaskDragDrop"
import BaseButton from "@/ui/base/BaseButton.vue"
import BaseIcon from "@/ui/base/BaseIcon"
import DynamicTagsPanel from "@/ui/common/misc/DynamicTagsPanel.vue"
import TaskCard from "@/ui/modules/TaskCard"

import {BOARD_COLUMNS, DRAGGABLE_ATTRS, SORTABLE_ANIMATION_MS} from "../../model/constants"

import type {MoveTaskByOrderParams, Tag, Task, TaskStatus} from "@shared/types/storage"

const props = defineProps<{tasks: Task[]; dndDisabled: boolean}>()

const uiStore = useUIStore()
const tasksStore = useTasksStore()
const tagsStore = useTagsStore()

const activeTagIdsByStatus = reactive<Record<TaskStatus, Tag["id"][]>>({active: [], discarded: [], done: []})
const localTasksByStatus = reactive<Record<TaskStatus, Task[]>>({active: [], discarded: [], done: []})

const pendingCrossColumnMove = ref<MoveTaskByOrderParams | null>(null)

const {isDragging, isCommitting, isDragDisabled, onDragStart, onDragEnd, onDragOver, runWithCommit} = useTaskDragDrop({
  dndDisabled: () => props.dndDisabled,
  onDragEnd: flushPendingCrossColumnMove,
})

const tasksByStatus = computed<Record<TaskStatus, Task[]>>(() => {
  return props.tasks.reduce(
    (acc, task) => {
      acc[task.status].push(task)
      return acc
    },
    {active: [], discarded: [], done: []} as Record<TaskStatus, Task[]>,
  )
})
const tagsByStatus = computed<Record<TaskStatus, Tag[]>>(() => {
  const rawTagsByStatus = tasksStore.dailyTasks.reduce(
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

const visibleColumns = computed(() => BOARD_COLUMNS.filter((column) => !isColumnHidden(column.status)))

const filteredTasksByStatus = computed<Record<TaskStatus, Task[]>>(() => {
  return {
    active: getFilteredTasksByStatus("active"),
    discarded: getFilteredTasksByStatus("discarded"),
    done: getFilteredTasksByStatus("done"),
  }
})

function syncLocalTasks() {
  localTasksByStatus.active = filteredTasksByStatus.value.active.map((task) => deepClone(task))
  localTasksByStatus.discarded = filteredTasksByStatus.value.discarded.map((task) => deepClone(task))
  localTasksByStatus.done = filteredTasksByStatus.value.done.map((task) => deepClone(task))
}

function isColumnEmpty(status: TaskStatus) {
  return tasksByStatus.value[status].length === 0
}

function isColumnHidden(status: TaskStatus) {
  if (!uiStore.columnsHideEmpty) return false
  return isColumnEmpty(status)
}

function isColumnCollapsed(status: TaskStatus) {
  if (uiStore.columnsAutoCollapseEmpty) return !isDragging.value && isColumnEmpty(status)
  return Boolean(uiStore.columnsCollapsed[status])
}

function onToggleColumn(status: TaskStatus) {
  if (uiStore.columnsAutoCollapseEmpty) return
  uiStore.toggleColumnCollapsed(status)
}

function onColumnDragEnter(status: TaskStatus) {
  if (uiStore.columnsAutoCollapseEmpty) return
  if (!isDragging.value) return
  if (!isColumnCollapsed(status)) return

  uiStore.setColumnCollapsed(status, false)
}

function getTaskTags(task: Task): Tag[] {
  const tags = task.tags.map((tag) => tagsStore.tagsMap.get(tag.id)).filter(Boolean) as Tag[]
  return sortTags(tags)
}

function getSelectedTagIdsSet(status: TaskStatus) {
  return new Set(activeTagIdsByStatus[status])
}

function getFilteredTasksByStatus(status: TaskStatus) {
  const selectedTagIds = activeTagIdsByStatus[status]
  if (!selectedTagIds.length) return tasksByStatus.value[status]

  const selectedTagIdsSet = new Set(selectedTagIds)
  return tasksByStatus.value[status].filter((task) => task.tags.some((tag) => selectedTagIdsSet.has(tag.id)))
}

function onSelectTag(status: TaskStatus, id: Tag["id"]) {
  const selectedTagIds = activeTagIdsByStatus[status]
  if (selectedTagIds.includes(id)) {
    activeTagIdsByStatus[status] = selectedTagIds.filter((tagId) => tagId !== id)
    return
  }

  activeTagIdsByStatus[status] = [...selectedTagIds, id]
}

function flushPendingCrossColumnMove() {
  const pendingMove = pendingCrossColumnMove.value
  if (!pendingMove) return
  pendingCrossColumnMove.value = null

  setTimeout(() => commitColumnMove(pendingMove), SORTABLE_ANIMATION_MS)
}

async function onColumnChange(status: TaskStatus, event: {added?: {newIndex: number}; moved?: {newIndex: number; oldIndex: number}}) {
  if (event.moved && event.moved.newIndex === event.moved.oldIndex) return
  if (!event.added && !event.moved) return

  const newIndex = event.added?.newIndex ?? event.moved?.newIndex
  if (newIndex === undefined) return

  const movedTask = localTasksByStatus[status][newIndex]
  if (!movedTask) return

  movedTask.status = status

  const {targetTaskId, position} = resolveMoveTarget(localTasksByStatus[status], newIndex)

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
    const result = await tasksStore.moveTaskByOrder({
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

watch(
  filteredTasksByStatus,
  () => {
    if (isDragging.value || isCommitting.value) return
    syncLocalTasks()
  },
  {immediate: true},
)
</script>

<template>
  <div class="h-full w-full overflow-x-auto overflow-y-hidden p-1.5" @dragover="onDragOver">
    <div class="inline-flex h-full min-w-full gap-1.5">
      <div
        v-for="column in visibleColumns"
        :key="column.status"
        class="bg-base-100 border-base-300 flex h-full min-w-0 flex-col rounded-xl border"
        :class="isColumnCollapsed(column.status) ? 'max-w-20 min-w-20' : 'min-w-88 flex-1'"
        @dragenter="onColumnDragEnter(column.status)"
      >
        <template v-if="isColumnCollapsed(column.status)">
          <div class="flex h-full flex-col items-center justify-start gap-2 py-3">
            <BaseIcon :name="column.icon" class="size-4" :class="column.titleClass" />
            <span class="rounded-full px-2 py-0.5 text-xs font-medium" :class="column.counterClass">
              {{ filteredTasksByStatus[column.status].length }}
            </span>
            <BaseButton
              v-if="!uiStore.columnsAutoCollapseEmpty"
              variant="ghost"
              icon="chevron-right"
              tooltip="Expand column"
              class="size-6 p-0"
              @click="onToggleColumn(column.status)"
            />
          </div>
        </template>

        <template v-else>
          <div class="border-base-300 flex items-center justify-between border-b px-3 py-1.5">
            <div class="flex items-center gap-2" :class="column.titleClass">
              <BaseIcon :name="column.icon" class="size-4" />
              <span class="text-sm font-medium">{{ column.label }}</span>
              <span class="rounded-full px-2 py-0.5 text-xs font-medium" :class="column.counterClass">
                {{ filteredTasksByStatus[column.status].length }}
              </span>
            </div>
            <BaseButton
              v-if="!uiStore.columnsAutoCollapseEmpty"
              variant="ghost"
              icon="chevron-left"
              tooltip="Collapse column"
              class="size-6 p-0"
              @click="onToggleColumn(column.status)"
            />
          </div>

          <div class="border-base-300 h-header border-b px-3 py-1.5">
            <DynamicTagsPanel
              :tags="tagsByStatus[column.status]"
              :selected-tags="getSelectedTagIdsSet(column.status)"
              selectable
              @select="onSelectTag(column.status, $event)"
            />
          </div>

          <div class="relative flex min-w-0 flex-1 overflow-x-hidden overflow-y-auto p-1.5">
            <VueDraggable
              :list="localTasksByStatus[column.status]"
              item-key="id"
              :disabled="isDragDisabled"
              class="flex min-h-full w-full min-w-0 flex-col overflow-x-hidden"
              v-bind="DRAGGABLE_ATTRS"
              @start="onDragStart"
              @end="onDragEnd"
              @change="onColumnChange(column.status, $event)"
            >
              <template #item="{element: task}">
                <div class="relative mx-1.5 mb-1.5 last:mb-0">
                  <div class="w-full shrink-0">
                    <TaskCard :task="task" :tags="getTaskTags(task)" view="columns" />
                  </div>
                </div>
              </template>
            </VueDraggable>

            <div
              v-if="!localTasksByStatus[column.status].length && !isDragging"
              class="text-base-content/70 pointer-events-none absolute inset-1.5 flex flex-col items-center justify-center gap-2 rounded-lg text-center"
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
