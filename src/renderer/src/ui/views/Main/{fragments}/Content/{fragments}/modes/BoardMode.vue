<script setup lang="ts">
import VueDraggable from "vuedraggable"

import {useUIStore} from "@/stores/ui.store"
import BaseButton from "@/ui/base/BaseButton.vue"
import BaseIcon from "@/ui/base/BaseIcon"
import DynamicTagsPanel from "@/ui/common/misc/DynamicTagsPanel.vue"
import TaskCard from "@/ui/modules/TaskCard"

import {DRAGGABLE_ATTRS} from "../../model/constants"
import {useBoardModel} from "../../model/useBoardModel"

import type {Task} from "@shared/types/storage"

const props = defineProps<{tasks: Task[]; dndDisabled: boolean}>()

const uiStore = useUIStore()

const {
  isDragging,
  isDragDisabled,
  localTasksByStatus,
  filteredTasksByStatus,
  tagsByStatus,
  visibleColumns,
  isColumnCollapsed,
  onToggleColumn,
  onColumnDragEnter,
  onDragStart,
  onDragEnd,
  onDragOver,
  onColumnChange,
  onSelectTag,
  getSelectedTagIdsSet,
  getTaskTags,
} = useBoardModel({
  tasks: () => props.tasks,
  dndDisabled: () => props.dndDisabled,
})
</script>

<template>
  <div class="h-full w-full overflow-x-auto overflow-y-hidden p-1.5" @dragover="onDragOver">
    <div class="flex h-full min-w-full gap-1.5">
      <div
        v-for="column in visibleColumns"
        :key="column.status"
        :data-column-status="column.status"
        class="bg-base-100 border-base-300 flex h-full min-w-0 flex-col overflow-hidden rounded-xl border"
        :class="isColumnCollapsed(column.status) ? 'w-20 max-w-20 min-w-20' : 'min-w-[440px] flex-1'"
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
