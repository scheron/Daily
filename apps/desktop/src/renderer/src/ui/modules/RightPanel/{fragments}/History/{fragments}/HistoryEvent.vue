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
type EventTransition = {from: EventEndpoint; to: EventEndpoint}

const props = defineProps<{event: TaskEvent}>()

const branchesStore = useBranchesStore()

const metadata = computed(() => {
  const metadata: Record<TaskEventType, {icon: IconName; verb: string}> = {
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
  return metadata[props.event.type]
})

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
    return {from: projectEndpoint(event.fromBranchId), to: projectEndpoint(event.toBranchId)}
  }
  if (event.type === "moved" && (event.fromDate || event.toDate)) {
    return {
      from: {label: event.fromDate ? toDateLabel(event.fromDate, {short: true, year: false}) : "No date", icon: "calendar"},
      to: {label: event.toDate ? toDateLabel(event.toDate, {short: true, year: false}) : "No date", icon: "calendar"},
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
  <div class="history-row relative grid grid-cols-[20px_minmax(0,1fr)] items-start gap-2.5 py-2.5" :data-time="toTime(event.createdAt)" tabindex="0">
    <div class="text-base-content/60 flex size-5 shrink-0 items-center justify-center">
      <BaseIcon :name="metadata.icon" class="size-3.5" />
    </div>

    <span class="min-w-0 text-xs leading-5">
      <template v-if="transition">
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
      <template v-else>{{ metadata.verb }}</template>
    </span>

    <time :datetime="event.createdAt" class="sr-only">{{ toLocaleDateTime(event.createdAt) }}</time>
  </div>
</template>

<style scoped>
.history-row:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 2px;
  border-radius: 0.25rem;
}

.history-row::after {
  content: attr(data-time);
  position: absolute;
  top: 0.25rem;
  right: 0;
  z-index: 4;
  padding: 0.25rem 0.5rem;
  border-radius: 0.25rem;
  background: var(--color-base-content);
  color: var(--color-base-100);
  font-size: 0.75rem;
  line-height: 1.25;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
  opacity: 0;
  visibility: hidden;
  pointer-events: none;
}

.history-row:hover::after,
.history-row:focus-within::after {
  opacity: 1;
  visibility: visible;
}
</style>
