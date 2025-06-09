<script setup lang="ts">
import {Day} from "@/types/tasks"

import type {ISODate} from "@/types/date"

import BaseCalendar from "@/ui/base/BaseCalendar"

defineProps<{activeDay: ISODate; days: Day[]}>()

const emit = defineEmits<{"select-date": [date: ISODate]}>()

function selectDate(date: ISODate) {
  emit("select-date", date)
}
</script>

<template>
  <BaseCalendar mode="single" :days="days" :selected-date="activeDay" :initial-month="activeDay" size="md" @select-date="selectDate" />
</template>
