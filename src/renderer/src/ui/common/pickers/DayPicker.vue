<script lang="ts" setup>
import {ISODate} from "@/types/date"

import type {Day} from "@/types/tasks"

import BaseCalendar from "@/ui/base/BaseCalendar"
import BasePopup from "@/ui/base/BasePopup.vue"

withDefaults(
  defineProps<{
    title: string
    days: Day[]
    activeDay: string
  }>(),
  {
    days: () => [],
    title: "Select Day",
  },
)

const emit = defineEmits<{select: [date: ISODate], close: []}>()
</script>

<template>
  <BasePopup :title="title" container-class="p-0" @close="emit('close')">
    <template #trigger="{toggle, hide, show}">
      <slot name="trigger" :toggle="toggle" :hide="hide" :show="show" />
    </template>

    <BaseCalendar mode="single" :days="days" :initial-month="activeDay" size="sm" @select-date="emit('select', $event)" />
  </BasePopup>
</template>
