<script setup lang="ts">
import {computed} from "vue"

import {NO_PROJECT_ID} from "@daily/protocol"
import {toDateLabel, toLocaleDateTime, toTime} from "@daily/std"

import {TASK_COLUMNS} from "@/constants/ui"
import {useBranchesStore} from "@/stores/branches.store"
import BaseIcon from "@/ui/base/BaseIcon"
import {getPriorityLevel} from "@/utils/priority/getPriorityLevel"
import {getProjectName} from "@/utils/projects/getProjectName"
import {cn} from "@/utils/ui/tailwindcss"

import type {IconName} from "@/ui/base/BaseIcon"
import type {TaskEvent, TaskEventType, TaskPriority, TaskStatus} from "@daily/protocol"

type EventEndpoint = {label: string; icon?: IconName; textClass?: string; color?: string}
type EventTransition = {label?: string; from: EventEndpoint; to: EventEndpoint}

const TASK_EVENT_META: Record<TaskEventType, {icon: IconName; verb: string}> = {
  created: {icon: "plus", verb: "Created"},
  completed: {icon: "check-check", verb: "Completed"},
  reactivated: {icon: "refresh", verb: "Status changed"},
  discarded: {icon: "archive", verb: "Cancelled"},
  edited: {icon: "pencil", verb: "Edited"},
  deleted: {icon: "trash", verb: "Deleted"},
  restored: {icon: "undo", verb: "Restored"},
  moved: {icon: "move", verb: "Moved"},
  status_changed: {icon: "refresh", verb: "Status changed"},
  priority_changed: {icon: "priority-high", verb: "Priority changed"},
  project_changed: {icon: "project", verb: "Project changed"},
}

const props = defineProps<{event: TaskEvent}>()

const branchesStore = useBranchesStore()

const transition = computed<EventTransition | null>(() => {
  const event = props.event
  if (event.type === "status_changed" && event.fromStatus && event.toStatus) {
    return {from: statusEndpoint(event.fromStatus), to: statusEndpoint(event.toStatus)}
  }
  if (event.type === "priority_changed" && event.fromPriority && event.toPriority) {
    return {
      from: priorityEndpoint(event.fromPriority),
      to: priorityEndpoint(event.toPriority),
    }
  }
  if (event.type === "project_changed" && event.fromBranchId && event.toBranchId) {
    return {label: "Project", from: projectEndpoint(event.fromBranchId), to: projectEndpoint(event.toBranchId)}
  }
  if (event.type === "moved" && (event.fromDate || event.toDate)) {
    return {
      label: "Moved",
      from: {label: event.fromDate ? toDateLabel(event.fromDate, {short: true, year: false}) : "No date"},
      to: {label: event.toDate ? toDateLabel(event.toDate, {short: true, year: false}) : "No date"},
    }
  }
  return null
})

function statusEndpoint(status: TaskStatus): EventEndpoint {
  const column = TASK_COLUMNS.find((column) => column.status === status)
  return {label: column?.label ?? status, icon: column?.icon, textClass: column?.textClass}
}

function priorityEndpoint(priority: TaskPriority): EventEndpoint {
  const level = getPriorityLevel(priority)
  return {label: level.label, icon: `priority-${level.value}`, color: level.color}
}

function projectEndpoint(id: string): EventEndpoint {
  const project = branchesStore.branchesMap.get(id)
  return {label: id === NO_PROJECT_ID ? getProjectName(null) : (project?.name ?? id), icon: id === NO_PROJECT_ID ? "project-off" : "project"}
}

function getEndpointClasses(textClass?: string) {
  return cn("inline-flex max-w-full items-center gap-1 align-bottom", textClass)
}
</script>

<template>
  <div class="flex items-center gap-2.5 px-4 py-1 opacity-75">
    <div class="bg-base-300 text-base-content/60 flex size-5 shrink-0 items-center justify-center rounded-full">
      <BaseIcon :name="TASK_EVENT_META[event.type].icon" class="size-3" />
    </div>

    <span class="min-w-0 flex-1 text-xs">
      <template v-if="transition">
        <template v-if="transition.label">{{ transition.label }}: </template>
        <span :class="getEndpointClasses(transition.from.textClass)" :style="{color: transition.from.color}">
          <BaseIcon v-if="transition.from.icon" :name="transition.from.icon" class="size-3" />
          <span class="min-w-0 break-words">{{ transition.from.label }}</span>
        </span>
        →
        <span :class="getEndpointClasses(transition.to.textClass)" :style="{color: transition.to.color}">
          <BaseIcon v-if="transition.to.icon" :name="transition.to.icon" class="size-3" />
          <span class="min-w-0 break-words">{{ transition.to.label }}</span>
        </span>
      </template>
      <template v-else>{{ TASK_EVENT_META[event.type].verb }}</template>
    </span>

    <span v-tooltip="toLocaleDateTime(event.createdAt)" class="text-base-content/50 shrink-0 text-xs tabular-nums">
      {{ toDateLabel(event.createdAt, {short: true, year: false}) }}, {{ toTime(event.createdAt) }}
    </span>
  </div>
</template>
