<script setup lang="ts">
import {computed} from "vue"

import {toDurationLabel} from "@shared/utils/date/formatters"
import {sortTags} from "@shared/utils/tags/sortTags"
import {toTaskIdHash} from "@shared/utils/tasks/toTaskIdHash"
import {useTagsStore} from "@/stores/tags.store"
import {countMarkdownImages} from "@/utils/codemirror/wordCount"
import BaseIcon from "@/ui/base/BaseIcon"
import DynamicTagsPanel from "@/ui/common/misc/DynamicTagsPanel.vue"

import ActivityTaskPreviewMarkdownContent from "./ActivityTaskPreviewMarkdownContent.vue"

import type {Tag, Task, TaskStatus} from "@shared/types/storage"

const props = defineProps<{task: Task}>()

const tagsStore = useTagsStore()

const tags = computed<Tag[]>(() => sortTags(props.task.tags.map((tag) => tagsStore.tagsMap.get(tag.id)).filter(Boolean) as Tag[]))
const imageCount = computed(() => countMarkdownImages(props.task.content))
const showTime = computed(() => props.task.estimatedTime > 0)
const estimateLabel = computed(() => (showTime.value ? toDurationLabel(props.task.estimatedTime) : ""))
const spentLabel = computed(() => (showTime.value && props.task.spentTime > 0 ? toDurationLabel(props.task.spentTime) : ""))
const hasFooter = computed(() => imageCount.value > 0 || showTime.value)

function cardClass(status: TaskStatus) {
  if (status === "done") return "border-success/30"
  if (status === "discarded") return "border-warning/30"
  return "border-base-300/50"
}

function statusClass(status: TaskStatus) {
  if (status === "active") return "text-error"
  if (status === "discarded") return "text-warning"
  return "text-success"
}

function statusIcon(status: TaskStatus) {
  if (status === "active") return "fire"
  if (status === "discarded") return "archive"
  return "check-check"
}
</script>

<template>
  <div class="bg-base-100 relative overflow-hidden rounded-2xl border" :class="cardClass(task.status)">
    <div class="relative z-10 flex w-full flex-col gap-3 px-5 py-4">
      <div class="flex w-full items-center gap-3">
        <DynamicTagsPanel :tags="tags" empty-message="No tags" size="sm" />
        <div class="ml-auto flex shrink-0 items-center gap-2">
          <span class="text-base-content/50 font-mono text-xs leading-none whitespace-nowrap">{{ toTaskIdHash(task.id) }}</span>
          <BaseIcon :name="statusIcon(task.status)" class="size-4" :class="statusClass(task.status)" />
        </div>
      </div>

      <div class="transition-opacity duration-200" :class="{'opacity-50': ['done', 'discarded'].includes(task.status)}">
        <ActivityTaskPreviewMarkdownContent :content="task.content" minimized />
      </div>

      <div v-if="hasFooter" class="flex items-center gap-2 text-xs">
        <div v-if="imageCount > 0" class="text-base-content/70 inline-flex items-center gap-1 px-2.5 py-1">
          <BaseIcon name="image" class="size-3.5" />
          <span>{{ imageCount }}</span>
        </div>

        <div v-if="showTime" class="ml-auto flex items-center gap-2">
          <div class="text-base-content/80 inline-flex items-center gap-1 px-2.5 py-1">
            <BaseIcon name="stopwatch" class="text-accent size-3.5" />
            <span>{{ estimateLabel }}</span>
          </div>
          <div v-if="spentLabel" class="text-base-content/80 inline-flex items-center gap-1 px-2.5 py-1">
            <BaseIcon name="check-check" class="text-success size-3.5" />
            <span>{{ spentLabel }}</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
