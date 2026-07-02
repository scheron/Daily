<script lang="ts" setup>
import {ISODate} from "@shared/types/common"
import BaseCalendar from "@/ui/base/BaseCalendar"
import BasePopup, {HorizontalPosition} from "@/ui/base/BasePopup.vue"

import type {Day} from "@shared/types/storage"

withDefaults(
  defineProps<{
    title?: string
    days: Day[]
    activeDay: string
    hideOnSelect?: boolean
    selectedDay?: ISODate | null
    hoverMode?: boolean
    position?: HorizontalPosition
  }>(),
  {
    days: () => [],
    title: "Select Day",
    selectedDay: null,
    hideOnSelect: false,
    hoverMode: false,
  },
)

const emit = defineEmits<{select: [date: ISODate]; close: []}>()

function onSelect(date: ISODate, hide: () => void) {
  emit("select", date)
  hide()
}
</script>

<template>
  <BasePopup hide-header :hover-mode="hoverMode" :position="position" container-class="p-0" @close="emit('close')">
    <template #trigger="{toggle, hide, show}">
      <slot name="trigger" :toggle="toggle" :hide="hide" :show="show" />
    </template>

    <template #default="{hide}">
      <BaseCalendar
        mode="single"
        :days="days"
        :selected-date="selectedDay"
        :initial-month="activeDay"
        size="sm"
        @select-date="onSelect($event, hide)"
      />
    </template>
  </BasePopup>
</template>
