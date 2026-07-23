<script setup lang="ts">
import {ISODate} from "@shared/types/common"
import {TaskEvent} from "@shared/types/storage"
import {toDateLabel, toLocaleDateTime, toTime} from "@shared/utils/date/formatters"
import {toTaskIdHash} from "@shared/utils/tasks/toTaskIdHash"
import {TASK_EVENT_META} from "@/constants/taskEvents"
import BaseButton from "@/ui/base/BaseButton"
import BaseIcon from "@/ui/base/BaseIcon"

import ActivityTaskPreview from "./{fragments}/ActivityTaskPreview.vue"
import {useActivityModel} from "./model/useActivityModel"

const {events, goToDay, openTask, isRestorable, restore} = useActivityModel()

function isMovedOut(event: TaskEvent): boolean {
  return event.type === "moved" && event.eventDate === event.fromDate
}

function moveDay(event: TaskEvent): ISODate | null {
  if (event.type !== "moved") return null
  return isMovedOut(event) ? event.toDate : event.fromDate
}

function movePreposition(event: TaskEvent): string {
  return isMovedOut(event) ? "to" : "from"
}

function canOpen(event: TaskEvent): boolean {
  return event.type !== "deleted"
}
</script>

<template>
  <div class="flex h-full min-h-0 flex-col px-1 py-2">
    <div v-if="events.length" class="min-h-0 flex-1 overflow-y-auto pr-3 pl-2">
      <div v-for="event in events" :key="event.id" class="flex items-center gap-2 py-1">
        <div class="flex size-5 shrink-0 items-center justify-center rounded-full" :class="TASK_EVENT_META[event.type].chipClass">
          <BaseIcon :name="TASK_EVENT_META[event.type].icon" class="size-3" />
        </div>

        <p class="flex min-w-0 flex-1 flex-wrap items-center gap-1 text-xs leading-snug">
          <span>{{ TASK_EVENT_META[event.type].verb }}</span>
          <ActivityTaskPreview v-if="canOpen(event)" :task-id="event.taskId" @open="openTask(event)">
            <template #trigger="{show, cancel, open}">
              <BaseButton
                variant="link"
                size="sm"
                class="inline-flex flex-row-reverse items-center gap-0.5 p-0 text-xs"
                @mouseenter="show"
                @mouseleave="cancel"
                @click="open"
              >
                {{ toTaskIdHash(event.taskId) }}
              </BaseButton>
            </template>
          </ActivityTaskPreview>

          <span v-else class="text-base-content/60">{{ toTaskIdHash(event.taskId) }}</span>

          <template v-if="event.type === 'moved' && moveDay(event)">
            <span class="text-base-content/60"> {{ movePreposition(event) }} </span>
            <BaseButton
              variant="link"
              size="sm"
              class="inline-flex flex-row-reverse items-center gap-0.5 p-0 text-xs"
              @click="goToDay(moveDay(event)!)"
            >
              {{ toDateLabel(moveDay(event)!, {short: true, year: false}) }}
            </BaseButton>
          </template>
        </p>

        <BaseButton
          v-if="isRestorable(event)"
          variant="ghost"
          size="sm"
          icon="undo"
          icon-class="size-3.5"
          tooltip="Restore"
          class="size-6 shrink-0 p-0"
          @click="restore(event)"
        />

        <span
          v-tooltip="{content: toLocaleDateTime(new Date(event.createdAt)), placement: 'top'}"
          class="text-base-content/40 shrink-0 text-xs tabular-nums"
        >
          {{ toTime(event.createdAt) }}
        </span>
      </div>
    </div>

    <p v-else class="text-base-content/40 m-auto px-3 py-3 text-xs">No activity on this day</p>
  </div>
</template>
