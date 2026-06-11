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
  <div class="h-full w-full overflow-x-hidden overflow-y-auto p-1.5" @dragover="onDragOver">
    <div class="flex w-full flex-col gap-1.5">
      <div
        v-for="row in visibleColumns"
        :key="row.status"
        :data-column-status="row.status"
        class="bg-base-100 border-base-300 flex w-full flex-col overflow-hidden rounded-xl border"
        :class="isColumnCollapsed(row.status) ? 'h-12 max-h-12 min-h-12' : ''"
        @dragenter="onColumnDragEnter(row.status)"
      >
        <template v-if="isColumnCollapsed(row.status)">
          <div class="flex h-full items-center gap-2 px-3">
            <BaseIcon :name="row.icon" class="size-4" :class="row.titleClass" />
            <span class="rounded-full px-2 py-0.5 text-xs font-medium" :class="row.counterClass">
              {{ filteredTasksByStatus[row.status].length }}
            </span>
            <BaseButton
              v-if="!uiStore.columnsAutoCollapseEmpty"
              variant="ghost"
              icon="chevron-down"
              tooltip="Expand row"
              class="size-6 p-0"
              @click="onToggleColumn(row.status)"
            />
          </div>
        </template>

        <template v-else>
          <div class="border-base-300 flex items-center gap-3 border-b px-3 py-1.5">
            <div class="flex shrink-0 items-center gap-2" :class="row.titleClass">
              <BaseIcon :name="row.icon" class="size-4" />
              <span class="text-sm font-medium">{{ row.label }}</span>
              <span class="rounded-full px-2 py-0.5 text-xs font-medium" :class="row.counterClass">
                {{ filteredTasksByStatus[row.status].length }}
              </span>
            </div>

            <div class="min-w-0 flex-1">
              <DynamicTagsPanel
                :tags="tagsByStatus[row.status]"
                :selected-tags="getSelectedTagIdsSet(row.status)"
                selectable
                @select="onSelectTag(row.status, $event)"
              />
            </div>

            <BaseButton
              v-if="!uiStore.columnsAutoCollapseEmpty"
              variant="ghost"
              icon="chevron-up"
              tooltip="Collapse row"
              class="size-6 shrink-0 p-0"
              @click="onToggleColumn(row.status)"
            />
          </div>

          <div class="relative flex min-h-[158px] overflow-x-auto overflow-y-hidden p-1.5">
            <VueDraggable
              :list="localTasksByStatus[row.status]"
              item-key="id"
              :disabled="isDragDisabled"
              class="flex min-w-full flex-row"
              v-bind="DRAGGABLE_ATTRS"
              @start="onDragStart"
              @end="onDragEnd"
              @change="onColumnChange(row.status, $event)"
            >
              <template #item="{element: task}">
                <div class="relative mr-1.5 h-[134px] w-[294px] shrink-0 last:mr-0">
                  <TaskCard :task="task" :tags="getTaskTags(task)" view="rows" />
                </div>
              </template>
            </VueDraggable>

            <div
              v-if="!localTasksByStatus[row.status].length && !isDragging"
              class="text-base-content/70 pointer-events-none absolute inset-1.5 flex flex-col items-center justify-center gap-2 rounded-lg text-center"
            >
              <div class="bg-base-200 rounded-full p-3">
                <BaseIcon name="empty" class="size-5" />
              </div>
              <span class="text-sm">No {{ row.emptyLabel }} tasks</span>
            </div>
          </div>
        </template>
      </div>
    </div>
  </div>
</template>
