<script setup lang="ts">
import {computed} from "vue"

import {useTasksStore} from "@/stores/tasks.store"
import BaseButton from "@/ui/base/BaseButton.vue"
import BaseCalendar from "@/ui/base/BaseCalendar"
import BasePopup from "@/ui/base/BasePopup.vue"
import ContextMenu from "@/ui/common/misc/ContextMenu"
import DynamicTagsPanel from "@/ui/common/misc/DynamicTagsPanel.vue"
import MarkdownContent from "@/ui/common/misc/MarkdownContent.vue"

import QuickActions from "./{fragments}/QuickActions.vue"
import StatusButtons from "./{fragments}/StatusButtons.vue"
import TagsMenu from "./{fragments}/TagsMenu.vue"
import TimeTrackingButton from "./{fragments}/TimeTrackingButton.vue"
import {useTaskModel} from "./model/useTaskModel"

import type {IconName} from "@/ui/base/BaseIcon"
import type {ContextMenuItem, ContextMenuSelectEvent} from "@/ui/common/misc/ContextMenu"
import type {Tag, Task, TaskStatus} from "@shared/types/storage"

type TaskCardView = "list" | "column"

type StatusAction = {
  label: string
  value: TaskStatus
  icon: IconName
  tooltip: string
}

const props = withDefaults(
  defineProps<{
    task: Task
    tags?: Tag[]
    view?: TaskCardView
  }>(),
  {
    tags: () => [],
    view: "list",
  },
)

const tasksStore = useTasksStore()

const {startEdit, changeStatus, deleteTask, rescheduleTask, copyToClipboardTask, updateTaskTags} = useTaskModel(props)
const isColumnView = computed(() => props.view === "column")

const STATUS_ACTIONS: StatusAction[] = [
  {label: "Active", value: "active", icon: "fire", tooltip: "Set as active"},
  {label: "Discarded", value: "discarded", icon: "archive", tooltip: "Discard task"},
  {label: "Done", value: "done", icon: "check-check", tooltip: "Mark as done"},
]

const currentStatusAction = computed(() => STATUS_ACTIONS.find((status) => status.value === props.task.status) ?? STATUS_ACTIONS[0])

const menuItems = computed<ContextMenuItem[]>(() => [
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
  {value: "copy", label: "Copy", icon: "copy"},
])

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
  if (event.item.value === "copy") copyToClipboardTask()
  if (event.parent && event.parent.item.value === "status") changeStatus(event.item.value as TaskStatus)
}

function onSelectStatus(status: TaskStatus, hide?: () => void) {
  changeStatus(status)
  hide?.()
}

function getStatusTriggerClass(status: TaskStatus) {
  if (status === "active") return "text-error hover:bg-error/10"
  if (status === "discarded") return "text-warning hover:bg-warning/10"
  if (status === "done") return "text-success hover:bg-success/10"
  return ""
}

function getStatusActionClass(status: TaskStatus) {
  if (props.task.status !== status) return "text-base-content/70 hover:bg-base-200 hover:text-base-content"
  if (status === "active") return "text-error bg-error/10 hover:bg-error/20"
  if (status === "discarded") return "text-warning bg-warning/10 hover:bg-warning/20"
  if (status === "done") return "text-success bg-success/10 hover:bg-success/20"
  return ""
}
</script>

<template>
  <ContextMenu :items="menuItems" @select="onSelect">
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
          <div class="flex shrink-0 items-center gap-2">
            <template v-if="isColumnView">
              <TimeTrackingButton :task="task" />

              <BasePopup hide-header container-class="min-w-32 p-1" position="end" content-class="gap-1">
                <template #trigger="{toggle}">
                  <BaseButton
                    variant="ghost"
                    class="size-7 p-0"
                    :class="getStatusTriggerClass(currentStatusAction.value)"
                    :icon="currentStatusAction.icon"
                    :tooltip="currentStatusAction.tooltip"
                    icon-class="size-4"
                    @click="toggle"
                  />
                </template>

                <template #default="{hide}">
                  <BaseButton
                    v-for="status in STATUS_ACTIONS"
                    :key="status.value"
                    variant="ghost"
                    class="w-full justify-start px-2 py-1 text-xs"
                    :class="getStatusActionClass(status.value)"
                    :icon="status.icon"
                    icon-class="size-4"
                    :tooltip="status.tooltip"
                    @click="onSelectStatus(status.value, hide)"
                  >
                    {{ status.label }}
                  </BaseButton>
                </template>
              </BasePopup>
            </template>

            <template v-else>
              <QuickActions :task-date="task.scheduled.date" @move-date="rescheduleTask" @edit="startEdit" @delete="deleteTask" />
              <TimeTrackingButton :task="task" />
              <StatusButtons :status="task.status" @update:status="changeStatus" />
            </template>
          </div>
        </div>

        <div
          class="transition-opacity duration-200"
          :class="[{'opacity-50': ['done', 'discarded'].includes(task.status)}, isColumnView ? 'mb-2' : 'mb-5']"
        >
          <MarkdownContent :content="task.content" />
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
  </ContextMenu>
</template>
