<script setup lang="ts">
import {computed} from "vue"

import {NO_PROJECT_ID} from "@daily/protocol"
import {toLocaleDateTime, toTime} from "@daily/std"

import {TASK_COLUMNS} from "@/constants/ui"
import {useBranchesStore} from "@/stores/branches"
import BaseIcon from "@/ui/base/BaseIcon.vue"
import AgentIcon from "@/ui/common/(icons)/AgentIcon.vue"
import ProjectIcon from "@/ui/common/(icons)/ProjectIcon.vue"
import {getPriorityLevel} from "@/utils/priority/getPriorityLevel"
import {getProjectName} from "@/utils/projects/getProjectName"
import {cn} from "@/utils/ui/tailwindcss"
import {toActivityDateLabel} from "../../../utils/toActivityDateLabel"

import type {IconName} from "@/types/icons"
import type {Branch, TaskEvent, TaskEventType, TaskPriority, TaskStatus} from "@daily/protocol"

type EventEndpoint = {label: string; icon?: IconName; project?: Pick<Branch, "id" | "emoji">; textClass?: string; color?: string}
type EventTransition = {from: EventEndpoint; to: EventEndpoint}

const props = defineProps<{event: TaskEvent; today: string}>()

const branchesStore = useBranchesStore()

const sourceLabel = computed(() => {
  if (props.event.kind === "agent") return "Daily Assistant"
  if (props.event.kind === "mcp") return props.event.provider?.trim() || "MCP"
  return null
})

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
    return {from: dateEndpoint(event.fromDate), to: dateEndpoint(event.toDate)}
  }
  return null
})

const fromEndpointClass = computed(() => cn("inline-flex max-w-full items-center gap-1 align-bottom", transition.value?.from.textClass))
const toEndpointClass = computed(() => cn("inline-flex max-w-full items-center gap-1 align-bottom", transition.value?.to.textClass))
const markerClass = computed(() =>
  cn("history-source relative flex size-5 shrink-0 items-center justify-center", [
    Boolean(sourceLabel.value) ? "text-accent" : "text-base-content/60",
  ]),
)

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
  return {label: id === NO_PROJECT_ID ? getProjectName(null) : (project?.name ?? id), project: project ?? {id}}
}

function dateEndpoint(date: TaskEvent["fromDate"]): EventEndpoint {
  return {label: date ? toActivityDateLabel(date, props.today, {year: false}) : "No date", icon: "calendar"}
}
</script>

<template>
  <div class="history-row relative grid grid-cols-[20px_minmax(0,1fr)] items-start gap-2.5 py-1" :data-time="toTime(event.createdAt)" tabindex="0">
    <div
      :class="markerClass"
      :role="sourceLabel ? 'img' : undefined"
      :aria-label="sourceLabel ?? undefined"
      :data-source="sourceLabel ?? undefined"
      :tabindex="sourceLabel ? 0 : undefined"
    >
      <BaseIcon v-if="event.kind === 'agent'" name="logo" class="size-3.5" />
      <AgentIcon v-else-if="event.kind === 'mcp'" :name="event.provider ?? ''" class="size-3.5" />
      <BaseIcon v-else :name="metadata.icon" class="size-3.5" />
    </div>

    <span class="min-w-0 text-xs leading-5">
      <template v-if="transition">
        <span :class="fromEndpointClass" :style="{color: transition.from.color}">
          <ProjectIcon v-if="transition.from.project" :project="transition.from.project" class="size-3" />
          <BaseIcon v-else-if="transition.from.icon" :name="transition.from.icon" class="size-3" />
          <span class="min-w-0 break-words">{{ transition.from.label }}</span>
        </span>
        →
        <span :class="toEndpointClass" :style="{color: transition.to.color}">
          <ProjectIcon v-if="transition.to.project" :project="transition.to.project" class="size-3" />
          <BaseIcon v-else-if="transition.to.icon" :name="transition.to.icon" class="size-3" />
          <span class="min-w-0 break-words">{{ transition.to.label }}</span>
        </span>
      </template>
      <template v-else>{{ metadata.verb }}</template>
    </span>

    <time :datetime="event.createdAt" class="sr-only">{{ toLocaleDateTime(event.createdAt) }}</time>
  </div>
</template>

<style scoped>
.history-row:focus-visible,
.history-source:focus-visible {
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

.history-source[data-source]::after {
  content: attr(data-source);
  position: absolute;
  left: 0;
  bottom: calc(100% + 5px);
  z-index: 5;
  padding: 0.25rem 0.5rem;
  border-radius: 0.25rem;
  background: var(--color-base-content);
  color: var(--color-base-100);
  font-size: 0.75rem;
  white-space: nowrap;
  opacity: 0;
  visibility: hidden;
  pointer-events: none;
}

.history-source:hover::after,
.history-source:focus-visible::after {
  opacity: 1;
  visibility: visible;
}
</style>
