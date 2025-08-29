<script setup lang="ts">
import {computed} from "vue"

import type {Task, TaskStatus} from "@/types/tasks"

import BaseButton from "@/ui/base/BaseButton.vue"
import BaseIcon from "@/ui/base/BaseIcon"

const emit = defineEmits<{
  "change-status": [status: TaskStatus]
  edit: []
  "move-date": []
  "set-timer": []
  "open-timer": []
  delete: []
}>()

const props = defineProps<{task: Task}>()

const timeDisplay = computed(() => {
  // TODO: get time from task
  if (props.task.scheduled?.time) return props.task.status === "active" ? props.task.scheduled.time : "1h 23m"
  return null
})

function onTimeButtonClick() {
  if (props.task.status === "active") emit("open-timer")
}
</script>

<template>
  <div class="flex items-center gap-2">
    <div class="flex items-center gap-1 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
      <BaseButton
        variant="ghost"
        size="sm"
        icon="trash"
        class="hover:text-error hover:bg-error/10 size-7"
        icon-class="size-4"
        @click="emit('delete')"
      />

      <BaseButton
        variant="ghost"
        size="sm"
        class="hover:text-warning hover:bg-warning/10 size-7"
        icon-class="size-5"
        :icon="task.status === 'discarded' ? 'undo' : 'archive'"
        @click="emit('change-status', task.status === 'discarded' ? 'active' : 'discarded')"
      />

      <BaseButton
        variant="ghost"
        size="sm"
        icon="calendar"
        class="hover:text-accent hover:bg-accent/10 size-7"
        icon-class="size-5"
        @click="emit('move-date')"
      />
      <BaseButton
        variant="ghost"
        size="sm"
        icon="pencil"
        class="hover:text-accent hover:bg-accent/10 size-7"
        icon-class="size-4"
        @click="emit('edit')"
      />
    </div>

    <div
      v-if="task.scheduled?.time"
      class="flex shrink-0 cursor-pointer items-center gap-1 rounded-md border px-3 py-1 text-xs transition-colors duration-200"
      :class="[
        task.status === 'done'
          ? 'text-success bg-success/10 border-success/20 hover:bg-success/20'
          : 'text-accent border-accent/20 hover:border-accent/40 hover:bg-accent/20',
      ]"
      @click="onTimeButtonClick"
    >
      <BaseIcon :name="task.status === 'done' ? 'check-check' : 'stopwatch'" class="size-4" />
      <span v-if="timeDisplay" class="tracking-wide">
        {{ timeDisplay }}
      </span>
    </div>

    <BaseButton
      :variant="task.status === 'done' ? 'primary' : 'ghost'"
      size="sm"
      :icon="task.status === 'done' ? 'check-check' : 'check'"
      icon-class="size-4"
      class="shrink-0 rounded-md px-3 py-1 text-xs font-medium transition-colors duration-200"
      :class="{
        'bg-success hover:bg-success/80 text-white': task.status === 'done',
        'hover:text-success border-base-content hover:bg-success/10 hover:border-success/40 border': task.status !== 'done',
      }"
      @click="emit('change-status', task.status === 'done' ? 'active' : 'done')"
    >
      {{ task.status === "done" ? "Done" : "Mark as done" }}
    </BaseButton>
  </div>
</template>
