<script setup lang="ts">
import {computed, shallowRef, toRef, useTemplateRef} from "vue"

import {boardColumnForStatus, isMilestoneOverdue, milestoneCompletion, NO_PROJECT_ID, sortTags, toTaskIdHash} from "@daily/protocol"
import {getToday, notNullish, toDateLabel} from "@daily/std"

import {useMarkdownPreview} from "@/composables/useMarkdownPreview"
import {TASK_COLUMNS} from "@/constants/ui"
import {useBranchesStore} from "@/stores/branches"
import {useMilestonesStore} from "@/stores/milestones"
import {useSettingsStore} from "@/stores/settings"
import {useTagsStore} from "@/stores/tags"
import {useTaskRelationsStore} from "@/stores/task-relations"
import BaseIcon from "@/ui/base/BaseIcon.vue"
import MilestoneIcon from "@/ui/common/(icons)/MilestoneIcon.vue"
import PriorityIcon from "@/ui/common/(icons)/PriorityIcon.vue"
import ProjectIcon from "@/ui/common/(icons)/ProjectIcon.vue"
import {toShortDurationLabel} from "@/utils/date/toShortDurationLabel"
import {getPriorityLevel} from "@/utils/priority/getPriorityLevel"
import {cn} from "@/utils/ui/tailwindcss"

import type {IconName} from "@/types/icons"
import type {Task, TaskStatus} from "@daily/protocol"

const props = defineProps<{task: Task}>()

const branchesStore = useBranchesStore()
const milestonesStore = useMilestonesStore()
const settingsStore = useSettingsStore()
const tagsStore = useTagsStore()
const taskRelationsStore = useTaskRelationsStore()

const contentRef = useTemplateRef("content")

const status = computed(() => columnFor(boardColumnForStatus(props.task.status, settingsStore.settings?.appearance?.boardMode ?? "normal")))
const statusCellClass = computed(() => cn("preview-cell", status.value.textClass))
const dateLabel = computed(() => (props.task.scheduled ? toDateLabel(props.task.scheduled.date, {short: true}) : "No Date"))
const timeLabel = computed(() => `${toShortDurationLabel(props.task.estimatedTime) || "-"}/${toShortDurationLabel(props.task.spentTime) || "-"}`)
const project = computed(() => (props.task.branchId === NO_PROJECT_ID ? null : (branchesStore.branchesMap.get(props.task.branchId) ?? null)))
const projectLabel = computed(() => project.value?.name ?? "No Project")
const milestone = computed(() => (props.task.milestoneId ? (milestonesStore.milestonesMap.get(props.task.milestoneId) ?? null) : null))
const milestoneLabel = computed(() => milestone.value?.name ?? "No Milestone")
const milestoneProgress = computed(() => (milestone.value ? milestoneCompletion(milestone.value.progress) : 0))
const milestoneOverdue = computed(() => Boolean(milestone.value && isMilestoneOverdue(milestone.value, milestone.value.progress, getToday())))
const priorityLabel = computed(() => (props.task.priority === "none" ? "No Priority" : getPriorityLevel(props.task.priority).label))
const tags = computed(() => sortTags(props.task.tags.map((tag) => tagsStore.tagsMap.get(tag.id)).filter(notNullish)))
const relations = computed(() => {
  const related = taskRelationsStore.relatedTasksByTaskId.get(props.task.id)
  return [
    {label: "Blocked by", icon: "alert-triangle", chips: (related?.blockedBy ?? []).map(toRelationChip)},
    {label: "Blocks", icon: "ban", chips: (related?.blocks ?? []).map(toRelationChip)},
  ] satisfies {label: string; icon: IconName; chips: ReturnType<typeof toRelationChip>[]}[]
})

useMarkdownPreview(
  contentRef,
  toRef(() => props.task.content),
  shallowRef({isCompact: false, isReadOnly: true}),
)

function columnFor(status: TaskStatus) {
  return TASK_COLUMNS.find((column) => column.status === status)!
}

function toRelationChip(task: Task) {
  const column = columnFor(task.status)
  return {
    id: task.id,
    hash: toTaskIdHash(task.id),
    icon: column.icon,
    classes: cn("inline-flex shrink-0 items-center gap-1 rounded-full px-1.5 py-0.5 font-mono leading-none", column.counterClass),
  }
}
</script>

<template>
  <div class="px-3 pb-3 pt-2">
    <div class="grid grid-cols-3 gap-x-2">
      <div :class="statusCellClass">
        <BaseIcon :name="status.icon" class="size-3.5" aria-hidden="true" />
        <span>{{ status.label }}</span>
      </div>
      <div class="preview-cell" :data-empty="!task.scheduled">
        <BaseIcon name="calendar" class="size-3.5" aria-hidden="true" />
        <span>{{ dateLabel }}</span>
      </div>
      <div class="preview-cell" :data-empty="!task.estimatedTime && !task.spentTime">
        <BaseIcon name="stopwatch" class="size-3.5" aria-hidden="true" />
        <span>{{ timeLabel }}</span>
      </div>
      <div class="preview-cell" :data-empty="!project">
        <ProjectIcon :project="project" class="size-3.5" />
        <span>{{ projectLabel }}</span>
      </div>
      <div class="preview-cell" :data-empty="!milestone">
        <MilestoneIcon v-if="milestone" :completion="milestoneProgress" :overdue="milestoneOverdue" :size="14" aria-hidden="true" />
        <BaseIcon v-else name="milestone" class="size-3.5" aria-hidden="true" />
        <span>{{ milestoneLabel }}</span>
      </div>
      <div class="preview-cell" :data-empty="task.priority === 'none'">
        <PriorityIcon :priority="task.priority" class="size-3.5" />
        <span>{{ priorityLabel }}</span>
      </div>
    </div>

    <div class="preview-cell flex-wrap" :data-empty="!tags.length">
      <BaseIcon name="tags" class="size-3.5" aria-hidden="true" />
      <span v-for="tag in tags" :key="tag.id" :style="{color: tag.color}">#{{ tag.name }}</span>
      <span v-if="!tags.length">No Tags</span>
    </div>

    <div v-for="row in relations" :key="row.label" class="preview-cell flex-wrap" :data-empty="!row.chips.length">
      <BaseIcon :name="row.icon" class="size-3.5" aria-hidden="true" />
      <span>{{ row.label }}</span>
      <span v-for="chip in row.chips" :key="chip.id" :class="chip.classes">
        <BaseIcon :name="chip.icon" class="size-3" aria-hidden="true" />
        {{ chip.hash }}
      </span>
      <span v-if="!row.chips.length">—</span>
    </div>

    <div ref="content" class="preview-content mt-3.5 min-w-0"></div>
  </div>
</template>

<style scoped>
.preview-cell {
  display: flex;
  min-width: 0;
  min-height: 1.375rem;
  align-items: center;
  gap: 0.375rem;
  padding-block: 0.125rem;
  font-size: 0.6875rem;
  line-height: 1.25;
  overflow-wrap: anywhere;
}

.preview-cell > svg {
  flex-shrink: 0;
}

.preview-cell[data-empty="true"] {
  color: color-mix(in srgb, var(--color-base-content) 55%, transparent);
}

.preview-content :deep(.markdown-preview) {
  font-family: var(--font-sans);
  font-size: 0.75rem;
}

.preview-content :deep(.markdown-image > img) {
  max-height: 11rem;
  object-fit: contain;
}
</style>
