<script setup lang="ts">
import {computed, useTemplateRef} from "vue"

import {sortTags} from "@daily/protocol"
import {toDateLabel} from "@daily/std"

import {useMarkdownPreview} from "@/composables/useMarkdownPreview"
import {TASK_COLUMNS} from "@/constants/ui"
import BaseIcon from "@/ui/base/BaseIcon"
import BaseTag from "@/ui/base/BaseTag"
import {getProjectName} from "@/utils/projects/getProjectName"
import {cn} from "@/utils/ui/tailwindcss"

import type {TaskSearchResult, TaskStatus} from "@daily/protocol"

const props = defineProps<{result: TaskSearchResult}>()

const containerRef = useTemplateRef<HTMLDivElement>("container")

const statusIcon = computed(() => TASK_COLUMNS.find((column) => column.status === props.result.task.status)!.icon)
const sortedTags = computed(() => sortTags(props.result.task.tags))
const branchName = computed(() => getProjectName(props.result.branch))
const content = computed(() => props.result.task.content)
const previewOptions = computed(() => ({isCompact: true, matches: props.result.matches}))

useMarkdownPreview(containerRef, content, previewOptions)

function getStatusIconClasses(status: TaskStatus) {
  return cn(
    "size-4",
    {
      done: "text-success",
      cancelled: "text-warning",
      backlog: "text-base-content/70",
      ready_for_agent: "text-error",
      ready_to_merge: "text-info",
      todo: "text-base-content/80",
      in_progress: "text-accent",
    }[status],
  )
}
</script>

<template>
  <div class="hover:border-accent border-base-300 shadow-xs flex flex-col gap-2 rounded-lg border px-2 py-2 transition-colors duration-200">
    <div class="flex items-center justify-between gap-2">
      <div class="flex items-center gap-1.5">
        <span class="text-base-content/60 text-xs"> {{ result.task.scheduled ? toDateLabel(result.task.scheduled.date) : "No date" }} </span>
        <span class="bg-base-300 text-base-content/70 rounded px-1.5 py-0.5 text-[9px] font-medium">{{ branchName }}</span>
      </div>
      <BaseIcon :name="statusIcon" :class="getStatusIconClasses(result.task.status)" />
    </div>

    <div class="text-base-content px-1 text-[10px]">
      <div ref="container" class="search-result-content-viewer"></div>
    </div>

    <div v-if="sortedTags.length" class="flex flex-wrap gap-0.5">
      <BaseTag v-for="tag in sortedTags" :key="tag.id" :selectable="false" :tag="tag" />
    </div>
  </div>
</template>

<style scoped>
.search-result-content-viewer {
  width: 100%;
  overflow-x: auto;
  overflow-y: hidden;
}
</style>
