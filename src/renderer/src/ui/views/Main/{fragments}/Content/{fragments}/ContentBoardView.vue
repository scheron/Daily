<script setup lang="ts">
import {computed, ref} from "vue"

import {useUIStore} from "@/stores/ui.store"
import BaseButton from "@/ui/base/BaseButton.vue"
import BaseIcon from "@/ui/base/BaseIcon"
import DynamicTagsPanel from "@/ui/common/misc/DynamicTagsPanel.vue"
import TaskCard from "@/ui/modules/TaskCard"

import type {IconName} from "@/ui/base/BaseIcon"
import type {Tag, Task, TaskStatus} from "@shared/types/storage"

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
}>()

const uiStore = useUIStore()
const activeTagIdsByStatus = ref<Record<TaskStatus, Tag["id"][]>>({
  active: [],
  discarded: [],
  done: [],
})

const visibleColumns = computed(() => BOARD_COLUMNS.filter((column) => !isColumnHidden(column.status)))
const filteredTasksByStatus = computed<Record<TaskStatus, Task[]>>(() => {
  return {
    active: getFilteredTasksByStatus("active"),
    discarded: getFilteredTasksByStatus("discarded"),
    done: getFilteredTasksByStatus("done"),
  }
})

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
</script>

<template>
  <div class="h-full w-full overflow-x-auto overflow-y-hidden p-2">
    <div class="flex h-full min-w-full gap-2">
      <div
        v-for="column in visibleColumns"
        :key="column.status"
        class="bg-base-100 border-base-300 flex h-full flex-col rounded-xl border"
        :class="isColumnCollapsed(column.status) ? 'max-w-20 min-w-20' : 'min-w-88 flex-1'"
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

          <div class="flex flex-1 flex-col gap-2 overflow-y-auto p-2">
            <template v-if="filteredTasksByStatus[column.status].length">
              <TaskCard
                v-for="task in filteredTasksByStatus[column.status]"
                :key="task.id"
                :task="task"
                :tags="getTaskTags(task)"
                view="column"
                class="w-full shrink-0"
              />
            </template>
            <div v-else class="text-base-content/70 flex h-full flex-1 flex-col items-center justify-center gap-2 text-center">
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
