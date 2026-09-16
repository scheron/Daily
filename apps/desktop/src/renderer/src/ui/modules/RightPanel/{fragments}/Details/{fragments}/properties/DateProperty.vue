<script setup lang="ts">
import {computed} from "vue"

import {getTime, getTimezone, toDateLabel} from "@daily/std"

import {useTaskEditorStore} from "@/stores/task-editor"
import {useTasksStore} from "@/stores/tasks"
import BaseIcon from "@/ui/base/BaseIcon"
import BasePopup from "@/ui/base/BasePopup.vue"
import TaskCalendar from "@/ui/common/calendar/TaskCalendar"
import PropertyCell from "../PropertyCell.vue"

import type {ISODate, Task} from "@daily/protocol"

const props = defineProps<{task: Task}>()

const tasksStore = useTasksStore()
const taskEditorStore = useTaskEditorStore()

const dateLabel = computed(() => (props.task.scheduled ? toDateLabel(props.task.scheduled.date, {short: true}) : "Set date"))

function selectDate(date: ISODate, hide: () => void) {
  if (date !== props.task.scheduled?.date) {
    const scheduled = props.task.scheduled
    taskEditorStore.patch({scheduled: scheduled ? {...scheduled, date} : {date, time: getTime(), timezone: getTimezone()}})
  }
  hide()
}
</script>

<template>
  <BasePopup hide-header position="start">
    <template #trigger="{toggle}">
      <PropertyCell :label="dateLabel" :is-empty="!task.scheduled" @click="toggle">
        <template #icon>
          <BaseIcon name="calendar" class="size-4" />
        </template>
      </PropertyCell>
    </template>

    <template #default="{hide}">
      <div class="p-1">
        <TaskCalendar :days="tasksStore.days" :selected-date="task.scheduled?.date ?? null" @select-date="selectDate($event, hide)" />
      </div>
    </template>
  </BasePopup>
</template>
