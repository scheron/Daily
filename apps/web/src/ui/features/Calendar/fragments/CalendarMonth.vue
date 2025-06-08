<script setup lang="ts">
import BaseCalendar from "@/ui/base/BaseCalendar"

import type {ISODate} from "@daily/types/date"
import type {Day} from "@daily/types/tasks"

defineProps<{activeDay: ISODate; days: Day[]}>()

const emit = defineEmits<{"select-date": [date: ISODate]}>()

function selectDate(date: ISODate) {
  emit("select-date", date)
}
</script>

<template>
  <BaseCalendar mode="single" :days="days" :selected-date="activeDay" :initial-month="activeDay" size="md" @select-date="selectDate" />
</template>
