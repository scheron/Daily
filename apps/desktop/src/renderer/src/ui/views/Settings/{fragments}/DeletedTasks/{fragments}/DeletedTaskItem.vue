<script setup lang="ts">
import {computed} from "vue"
import {toasts} from "vue-toasts-lite"

import {sortTags, toTaskIdHash} from "@daily/protocol"
import {toDateLabel, toDurationLabel} from "@daily/std"

import {API} from "@/api"
import BaseButton from "@/ui/base/BaseButton"
import BaseIcon from "@/ui/base/BaseIcon"
import DynamicTagsPanel from "@/ui/common/misc/DynamicTagsPanel.vue"
import MarkdownContent from "@/ui/common/misc/MarkdownContent.vue"
import {ConfirmPopup} from "@/ui/overlays/ConfirmPopup"
import {countMarkdownImages} from "@/utils/codemirror/wordCount"

import type {Task} from "@daily/protocol"

const props = defineProps<{task: Task}>()
const emit = defineEmits<{restore: [task: Task]}>()

const sortedTags = computed(() => sortTags(props.task.tags))
const imageCount = computed(() => countMarkdownImages(props.task.content))
const dateLabel = computed(() => (props.task.scheduled ? toDateLabel(props.task.scheduled.date) : "No date"))
const spentLabel = computed(() => (props.task.spentTime > 0 ? toDurationLabel(props.task.spentTime) : ""))

async function onPermanentDelete(task: Task) {
  const deleted = await API.permanentlyDeleteTask(task.id)

  if (deleted) toasts.success("Task permanently deleted")
  else toasts.error("Failed to permanently delete task")
}
</script>

<template>
  <div :id="task.id" class="bg-base-100 group border-base-300/50 relative overflow-hidden rounded-2xl border transition-all duration-200">
    <div class="relative z-10 flex w-full flex-col gap-3 px-5 py-4">
      <div class="flex w-full items-center gap-3">
        <DynamicTagsPanel :tags="sortedTags" empty-message="No tags" size="sm" />

        <div class="ml-auto flex shrink-0 items-center gap-2">
          <span v-tooltip="{content: 'Task ID', placement: 'top'}" class="text-base-content/50 font-mono text-xs leading-none whitespace-nowrap">
            {{ toTaskIdHash(task.id) }}
          </span>

          <div class="flex gap-1">
            <BaseButton variant="ghost" size="sm" icon="undo" class="text-success hover:bg-success/10 size-7" @click="emit('restore', task)" />

            <ConfirmPopup
              title="Delete forever?"
              message="This cannot be undone."
              cancel-text="Cancel"
              confirm-class="text-error hover:bg-error/10"
              confirm-text="Delete"
              position="center"
              @confirm="onPermanentDelete(task)"
            >
              <template #trigger="{show}">
                <BaseButton variant="ghost" size="sm" icon="trash" class="text-error hover:bg-error/10 size-7" icon-class="size-4" @click="show()" />
              </template>
            </ConfirmPopup>
          </div>
        </div>
      </div>

      <MarkdownContent :content="task.content" minimized />

      <div class="flex items-center gap-2 text-xs">
        <div v-if="imageCount > 0" class="text-base-content/70 inline-flex items-center gap-1 px-2.5 py-1">
          <BaseIcon name="image" class="size-3.5" />
          <span>{{ imageCount }}</span>
        </div>

        <div class="ml-auto flex items-center gap-2">
          <div class="text-base-content/80 inline-flex items-center gap-1 px-2.5 py-1">
            <BaseIcon name="calendar" class="text-accent size-3.5" />
            <span>{{ dateLabel }}</span>
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
