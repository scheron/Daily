<script setup lang="ts">
import {computed} from "vue"
import {DateTime} from "luxon"

import {sortTags} from "@daily/protocol"
import {toDateLabel} from "@daily/std"

import {useBranchesStore} from "@/stores/branches.store"
import {useMilestonesStore} from "@/stores/milestones.store"
import BaseIcon from "@/ui/base/BaseIcon"
import {toShortDurationLabel} from "@/utils/date/toShortDurationLabel"
import {cn} from "@/utils/ui/tailwindcss"

import type {TaskDraft} from "@/types/taskDraft"
import type {IconName} from "@/ui/base/BaseIcon"
import type {Tag, Task, TaskStatus} from "@daily/protocol"

const props = defineProps<{task: Task}>()
const emit = defineEmits<{patch: [updates: Partial<TaskDraft>]}>()

const branchesStore = useBranchesStore()
const milestonesStore = useMilestonesStore()

const projectName = computed(() => branchesStore.branchesMap.get(props.task.branchId)?.name ?? "")
const milestoneName = computed(() => (props.task.milestoneId ? (milestonesStore.milestonesMap.get(props.task.milestoneId)?.name ?? "") : ""))
const statusView = computed(() => getStatusView(props.task.status))
const dateLabel = computed(() => (props.task.scheduled ? getDateLabel(props.task.scheduled.date) : ""))
const estimateLabel = computed(() => toShortDurationLabel(props.task.estimatedTime))
const tags = computed(() => sortTags(props.task.tags))

function getStatusView(status: TaskStatus): {label: string; icon: IconName; classes: string} {
  return {
    backlog: {label: "Backlog", icon: "bookmark" as const, classes: "bg-base-content/5 text-base-content"},
    active: {label: "Active", icon: "fire" as const, classes: "bg-error/5 text-error"},
    done: {label: "Done", icon: "check-check" as const, classes: "bg-success/5 text-success"},
    discarded: {label: "Discarded", icon: "archive" as const, classes: "bg-warning/5 text-warning"},
  }[status]
}

function getChipClasses(tone?: string) {
  return cn("inline-flex h-6 items-center gap-1.5 rounded-full px-3 py-1 text-[0.8125rem] leading-none", tone ?? "bg-accent/5 text-accent")
}

function getTagStyle(tag: Tag) {
  return {color: tag.color, backgroundColor: `color-mix(in srgb, ${tag.color} 5%, transparent)`}
}

function getDateLabel(date: string) {
  const today = DateTime.now().startOf("day")
  const day = DateTime.fromISO(date).startOf("day")
  if (day.equals(today)) return "Today"
  if (day.equals(today.plus({days: 1}))) return "Tomorrow"
  return toDateLabel(date, {short: true, year: false})
}

function removeTag(tag: Tag) {
  emit("patch", {tags: props.task.tags.filter((item) => item.id !== tag.id)})
}
</script>

<template>
  <div class="flex flex-wrap gap-1.5">
    <span data-chip="project" :class="getChipClasses()">
      <BaseIcon name="project" class="size-3.5" />
      <span>{{ projectName }}</span>
    </span>

    <span v-if="milestoneName" data-chip="milestone" :class="getChipClasses()">
      <BaseIcon name="milestone" class="size-3.5" />
      <span>{{ milestoneName }}</span>
      <button
        type="button"
        class="-mr-0.5 inline-flex cursor-pointer opacity-70 hover:opacity-100"
        aria-label="Remove milestone"
        @click="emit('patch', {milestoneId: null})"
      >
        <BaseIcon name="x" class="size-3" />
      </button>
    </span>

    <span data-chip="status" :class="getChipClasses(statusView.classes)">
      <BaseIcon :name="statusView.icon" class="size-3.5" />
      <span>{{ statusView.label }}</span>
    </span>

    <span v-if="task.scheduled" data-chip="date" :class="getChipClasses()">
      <BaseIcon name="calendar" class="size-3.5" />
      <span>{{ dateLabel }}</span>
      <button
        type="button"
        class="-mr-0.5 inline-flex cursor-pointer opacity-70 hover:opacity-100"
        aria-label="Remove date"
        @click="emit('patch', {scheduled: null})"
      >
        <BaseIcon name="x" class="size-3" />
      </button>
    </span>

    <span v-if="task.estimatedTime" data-chip="estimate" :class="getChipClasses()">
      <BaseIcon name="stopwatch" class="size-3.5" />
      <span>{{ estimateLabel }}</span>
      <button
        type="button"
        class="-mr-0.5 inline-flex cursor-pointer opacity-70 hover:opacity-100"
        aria-label="Remove estimate"
        @click="emit('patch', {estimatedTime: 0})"
      >
        <BaseIcon name="x" class="size-3" />
      </button>
    </span>

    <span v-for="tag in tags" :key="tag.id" data-chip="tag" :class="getChipClasses()" :style="getTagStyle(tag)">
      <span>#</span>
      <span>{{ tag.name }}</span>
      <button
        type="button"
        class="-mr-0.5 inline-flex cursor-pointer opacity-70 hover:opacity-100"
        :aria-label="`Remove ${tag.name}`"
        @click="removeTag(tag)"
      >
        <BaseIcon name="x" class="size-3" />
      </button>
    </span>
  </div>
</template>
