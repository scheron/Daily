<script setup lang="ts">
import {toDateLabel, toTime} from "@daily/std"

import BaseIcon from "@/ui/base/BaseIcon"
import {cn} from "@/utils/ui/tailwindcss"
import {TASK_EVENT_META} from "../constants"

import type {TaskEvent} from "@daily/protocol"

defineProps<{
  /** The task's events, newest first. */
  events: TaskEvent[]
}>()

function getEventChipClasses(type: TaskEvent["type"]) {
  return cn("flex size-5 shrink-0 items-center justify-center rounded-full", TASK_EVENT_META[type].chipClass)
}
</script>

<template>
  <div class="py-1">
    <div v-for="event in events" :key="event.id" class="flex items-center gap-2.5 px-3 py-1">
      <div :class="getEventChipClasses(event.type)">
        <BaseIcon :name="TASK_EVENT_META[event.type].icon" class="size-3" />
      </div>

      <span class="min-w-0 flex-1 text-xs font-semibold">
        {{ TASK_EVENT_META[event.type].verb }}
        <span v-if="event.type === 'moved' && event.fromDate && event.toDate" class="text-base-content/80 ml-1 font-normal">
          {{ toDateLabel(event.fromDate, {short: true, year: false}) }} → {{ toDateLabel(event.toDate, {short: true, year: false}) }}
        </span>
      </span>

      <span class="text-base-content/50 shrink-0 text-xs tabular-nums">
        {{ toDateLabel(event.createdAt, {short: true, year: false}) }}, {{ toTime(event.createdAt) }}
      </span>
    </div>
  </div>
</template>
