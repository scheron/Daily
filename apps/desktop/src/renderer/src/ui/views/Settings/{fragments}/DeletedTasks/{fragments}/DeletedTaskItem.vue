<script setup lang="ts">
import {computed} from "vue"
import {toasts} from "vue-toasts-lite"

import {sortTags} from "@daily/protocol"
import {toDateLabel, toDurationLabel} from "@daily/std"

import {API} from "@/api"
import BaseButton from "@/ui/base/BaseButton"
import BaseIcon from "@/ui/base/BaseIcon"
import DynamicTagsPanel from "@/ui/common/misc/DynamicTagsPanel.vue"
import MarkdownContent from "@/ui/common/misc/MarkdownContent.vue"
import ConfirmPopup from "@/ui/overlays/ConfirmPopup.vue"

import type {Task} from "@daily/protocol"

const props = defineProps<{task: Task}>()
const emit = defineEmits<{restore: [task: Task]}>()

const sortedTags = computed(() => sortTags(props.task.tags))
const imageCount = computed(() => props.task.content.match(/!\[[^\]]*\]\([^)]+\)/g)?.length ?? 0)
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
        <DynamicTagsPanel :tags="sortedTags" size="sm" />

        <div class="ml-auto flex shrink-0 items-center gap-2">
          <div class="flex gap-1">
            <BaseButton variant="success-ghost" icon="undo" size="sm" @click="emit('restore', task)" />

            <ConfirmPopup
              title="Delete forever?"
              message="This cannot be undone."
              cancel-text="Cancel"
              confirm-text="Delete"
              position="center"
              @confirm="onPermanentDelete(task)"
            >
              <template #trigger="{show}">
                <BaseButton variant="error-ghost" icon="trash" size="sm" @click="show()" />
              </template>
            </ConfirmPopup>
          </div>
        </div>
      </div>

      <MarkdownContent :content="task.content" />

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
