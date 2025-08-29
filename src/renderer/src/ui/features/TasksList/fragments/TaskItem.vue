<script setup lang="ts">
// TODO: Add logic
import {useTemplateRef, watch} from "vue"
import {until} from "@vueuse/core"
import {useMarkdown} from "@/composables/useMarkdown"

import type {Tag, Task, TaskStatus} from "@/types/tasks"

import BaseTag from "@/ui/base/BaseTag.vue"

import TaskItemToolbar from "./TaskItemToolbar.vue"

const VISIBLE_TAGS_COUNT = 3

const emit = defineEmits<{
  "change-status": [status: TaskStatus]
  edit: []
  "move-date": []
  "set-timer": []
  "open-timer": []
  delete: []
}>()

const props = withDefaults(defineProps<{task: Task; tags?: Tag[]}>(), {
  tags: () => [],
})

const contentRef = useTemplateRef<HTMLElement>("content")
const {renderMarkdown} = useMarkdown()

watch(
  () => props.task.content,
  async () => {
    await until(contentRef).toBeTruthy()

    if (contentRef.value) {
      contentRef.value.innerHTML = renderMarkdown(props.task.content)
    }
  },
  {immediate: true},
)
</script>

<template>
  <div
    class="bg-base-100 border-base-300 group hover:shadow-accent/5 hover:border-accent/20 relative overflow-hidden rounded-xl border transition-all duration-200 hover:shadow-lg"
  >
    <div class="p-5">
      <div class="mb-3 flex items-center justify-between gap-3">
        <div class="flex flex-1 flex-wrap gap-1.5">
          <BaseTag v-for="tag in tags.slice(0, VISIBLE_TAGS_COUNT)" :key="tag.name" :tag="tag" class="origin-left transform transition-transform" />
          <div
            v-if="tags.length > VISIBLE_TAGS_COUNT"
            class="bg-info/10 text-info border-info/20 flex items-center rounded-full border px-2.5 py-1 text-xs font-medium"
          >
            +{{ tags.length - VISIBLE_TAGS_COUNT }}
          </div>
        </div>

        <TaskItemToolbar
          :task="task"
          @edit="emit('edit')"
          @move-date="emit('move-date')"
          @set-timer="emit('set-timer')"
          @open-timer="emit('open-timer')"
          @delete="emit('delete')"
        />
      </div>

      <div class="mb-5 transition-opacity duration-200" :class="{'opacity-50': ['done', 'discarded'].includes(task.status)}">
        <div ref="content" class="markdown prose prose-sm max-w-none leading-relaxed break-words transition-all duration-200" />
      </div>
    </div>
  </div>
</template>
