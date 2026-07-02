<script setup lang="ts">
import {computed} from "vue"

import {toDateLabel} from "@shared/utils/date/formatters"
import {useTaskEditorStore} from "@/stores/task-editor"
import {useTasksStore} from "@/stores/tasks"
import BaseButton from "@/ui/base/BaseButton"
import BaseCalendar from "@/ui/base/BaseCalendar"
import BaseIcon from "@/ui/base/BaseIcon"
import BasePopup from "@/ui/base/BasePopup.vue"

import type {ISODate} from "@shared/types/common"
import type {Task} from "@shared/types/storage"

const props = defineProps<{task: Task}>()

const tasksStore = useTasksStore()
const taskEditorStore = useTaskEditorStore()

const dateLabel = computed(() => toDateLabel(props.task.scheduled.date, {short: true}))

function selectDate(date: ISODate, hide: () => void) {
  if (date !== props.task.scheduled.date) {
    taskEditorStore.patch({scheduled: {...props.task.scheduled, date}})
  }
  hide()
}
</script>

<template>
  <BasePopup hide-header position="start">
    <template #trigger="{toggle}">
      <BaseButton type="button" class="inline-flex items-center justify-start gap-1 p-0" size="sm" variant="text" @click.stop="toggle">
        <BaseIcon name="calendar" class="size-3.5" />
        <span class="leading-none">{{ dateLabel }}</span>
      </BaseButton>
    </template>

    <template #default="{hide}">
      <div class="p-1">
        <BaseCalendar mode="single" :days="tasksStore.days" :selected-date="task.scheduled.date" size="sm" @select-date="selectDate($event, hide)" />
      </div>
    </template>
  </BasePopup>
</template>
