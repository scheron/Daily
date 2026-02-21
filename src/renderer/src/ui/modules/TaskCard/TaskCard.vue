<script setup lang="ts">
import {computed, ref, useTemplateRef} from "vue"

import {useTasksStore} from "@/stores/tasks.store"
import BaseCalendar from "@/ui/base/BaseCalendar"
import ContextMenu from "@/ui/common/misc/ContextMenu"
import DynamicTagsPanel from "@/ui/common/misc/DynamicTagsPanel.vue"
import MarkdownContent from "@/ui/common/misc/MarkdownContent.vue"

import DeleteMenuItem from "./{fragments}/DeleteMenuItem.vue"
import QuickActions from "./{fragments}/QuickActions.vue"
import StatusButtons from "./{fragments}/StatusButtons.vue"
import StatusSelect from "./{fragments}/StatusSelect.vue"
import TagsMenu from "./{fragments}/TagsMenu.vue"
import TimeTrackingButton from "./{fragments}/TimeTrackingButton.vue"
import {useTaskModel} from "./model/useTaskModel"

import type {ContextMenuItem, ContextMenuSelectEvent} from "@/ui/common/misc/ContextMenu"
import type {LayoutType, Tag, Task, TaskStatus} from "@shared/types/storage"

const props = withDefaults(defineProps<{task: Task; tags?: Tag[]; view?: LayoutType}>(), {
  tags: () => [],
  view: "list",
})

const tasksStore = useTasksStore()
const contextMenuRef = useTemplateRef<InstanceType<typeof ContextMenu>>("contextMenu")

const {
  startEdit,
  changeStatus,
  canMoveUp,
  canMoveDown,
  moveUp,
  moveDown,
  toggleMinimized,
  deleteTask,
  rescheduleTask,
  copyToClipboardTask,
  updateTaskTags,
} = useTaskModel(props)
const canMinimize = ref(false)

const isColumnView = computed(() => props.view === "columns")

const menuItems = computed<ContextMenuItem[]>(() => {
  const items: ContextMenuItem[] = [
    {value: "edit", label: "Edit", icon: "pencil"},
    {separator: true},
    {
      value: "status",
      label: "Status",
      icon: "circle-pulse",
      children: [
        {value: "active", label: "Active", icon: "fire", class: getStatusClass("active")},
        {value: "discarded", label: "Discarded", icon: "archive", class: getStatusClass("discarded")},
        {value: "done", label: "Done", icon: "check-check", class: getStatusClass("done")},
      ],
    },
    {value: "tags", label: "Tags", icon: "tags", children: true},
    {value: "reschedule", label: "Reschedule", icon: "calendar", children: true},
    {separator: true},
    {value: "move-up", label: "Move Up", icon: "chevron-up", disabled: !canMoveUp.value},
    {value: "move-down", label: "Move Down", icon: "chevron-down", disabled: !canMoveDown.value},
    {separator: true},
  ]

  items.push({
    value: "toggle-minimized",
    label: props.task.minimized ? "Maximize" : "Minimize",
    icon: props.task.minimized ? "maximize" : "minimize",
    disabled: !canMinimize.value,
  })

  items.push(
    {value: "copy", label: "Copy", icon: "copy"},
    {separator: true},
    {
      value: "delete",
      label: "Delete",
      icon: "trash",
      class: "text-error hover:bg-error/10",
      classIcon: "text-error",
      classLabel: "text-error",
    },
  )

  return items
})

function getStatusClass(status: TaskStatus) {
  if (status !== props.task.status) return ""
  const isMatch = status === props.task.status

  if (!isMatch) return ""

  if (status === "active") return "text-error hover:bg-error/10 bg-error/10"
  if (status === "discarded") return "text-warning hover:bg-warning/10 bg-warning/10 "
  if (status === "done") return "text-success hover:bg-success/10 bg-success/10 "
  return ""
}

function onSelect(event: ContextMenuSelectEvent) {
  if (event.item.value === "edit") startEdit()
  if (event.item.value === "move-up") moveUp()
  if (event.item.value === "move-down") moveDown()
  if (event.item.value === "toggle-minimized") toggleMinimized()
  if (event.item.value === "copy") copyToClipboardTask()
  if (event.parent && event.parent.item.value === "status") changeStatus(event.item.value as TaskStatus)
}

function onMinimizeAvailabilityChange(isAvailable: boolean) {
  canMinimize.value = isAvailable
}

async function onDeleteFromMenu() {
  const isDeleted = await deleteTask()
  if (isDeleted) contextMenuRef.value?.close()
}
</script>

<template>
  <ContextMenu ref="contextMenuRef" :items="menuItems" @select="onSelect">
    <div
      :id="task.id"
      class="group min-h-card bg-base-100 hover:shadow-accent/5 relative overflow-hidden rounded-xl border transition-all duration-200 hover:shadow-lg"
      :class="{
        'border-success/30 hover:border-success/40': task.status === 'done',
        'border-warning/30 hover:border-warning/40': task.status === 'discarded',
        'border-base-300 hover:border-base-content/20': task.status === 'active',
      }"
    >
      <div
        class="absolute top-0 left-0 z-30 h-0 w-1 rounded-l-sm opacity-0 transition-all duration-500"
        aria-label="Task status indicator"
        :class="{
          'bg-warning/30 h-full opacity-100': task.status === 'discarded',
          'bg-success/30 h-full opacity-100': task.status === 'done',
        }"
      />

      <div class="relative z-10 w-full px-5 pt-3 pb-1">
        <div class="mb-3 flex w-full items-center justify-between gap-3">
          <DynamicTagsPanel :tags="tags" empty-message="No tags" />
          <div class="flex shrink-0 items-center gap-2" data-task-dnd-ignore="true">
            <template v-if="isColumnView">
              <TimeTrackingButton :task="task" />
              <StatusSelect :status="task.status" @update:status="changeStatus" />
            </template>

            <template v-else>
              <QuickActions
                :task-date="task.scheduled.date"
                :minimized="task.minimized"
                :can-minimize="canMinimize"
                @move-date="rescheduleTask"
                @toggle-minimized="toggleMinimized"
                @edit="startEdit"
                @delete="deleteTask"
              />
              <TimeTrackingButton :task="task" />
              <StatusButtons :status="task.status" @update:status="changeStatus" />
            </template>
          </div>
        </div>

        <div
          class="transition-opacity duration-200"
          :class="[{'opacity-50': ['done', 'discarded'].includes(task.status)}, isColumnView ? 'mb-2' : 'mb-5']"
        >
          <MarkdownContent :content="task.content" :minimized="task.minimized" @minimize-availability="onMinimizeAvailabilityChange" />
        </div>
      </div>
    </div>

    <template #child-tags>
      <div class="max-h-72 overflow-y-auto p-1">
        <TagsMenu :task="task" @update="updateTaskTags" />
      </div>
    </template>

    <template #child-reschedule>
      <div class="p-1">
        <BaseCalendar mode="single" :days="tasksStore.days" :selected-date="task.scheduled.date" size="sm" @select-date="rescheduleTask" />
      </div>
    </template>

    <template #item-delete="item">
      <DeleteMenuItem :item="item" @select="onDeleteFromMenu" />
    </template>
  </ContextMenu>
</template>
