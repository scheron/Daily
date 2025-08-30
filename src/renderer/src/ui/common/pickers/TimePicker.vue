<script lang="ts" setup>
import {ref} from "vue"
import {ISODate} from "@/types/date"
import {formatDuration, formatTime} from "@/utils/date"
import {withRepeatAction} from "@/utils/misc"

import BaseButton from "@/ui/base/BaseButton.vue"
import BasePopup from "@/ui/base/BasePopup.vue"

withDefaults(
  defineProps<{
    title?: string
    estimatedTime?: number
  }>(),
  {
    title: "Select Time",
    estimatedTime: 0,
  },
)

const emit = defineEmits<{select: [date: ISODate]; close: []}>()

const hours = ref(0)
const minutes = ref(0)

const {start: startIncrease, stop: stopIncrease} = withRepeatAction(onIncrease, {initialDelay: 300, interval: 30})
const {start: startDecrease, stop: stopDecrease} = withRepeatAction(onDecrease, {initialDelay: 300, interval: 30})

function onIncrease(type: "hours" | "minutes") {
  if (type === "hours") hours.value = Math.min(hours.value + 1, 23)
  else minutes.value = Math.min(minutes.value + 1, 59)
}

function onDecrease(type: "hours" | "minutes") {
  if (type === "hours") hours.value = Math.max(hours.value - 1, 0)
  else minutes.value = Math.max(minutes.value - 1, 0)
}
</script>

<template>
  <BasePopup hide-header container-class="p-0" @close="emit('close')">
    <template #trigger="{toggle, hide, show}">
      <slot name="trigger" :toggle="toggle" :hide="hide" :show="show" />
    </template>

    <div class="flex flex-col items-center gap-2 px-2 pt-4 pb-2 text-xs">
      <div class="text-base-content/60 flex flex-col items-center gap-2 font-mono font-bold">
        <p class="uppercase">{{ estimatedTime > 0 ? "Update" : "Set" }} estimated time</p>
        <div class="flex items-center justify-center gap-2 text-center">
          <div class="flex flex-col items-center justify-center">
            <BaseButton
              icon="chevron-up"
              size="sm"
              variant="ghost"
              @mousedown="startIncrease('hours')"
              @mouseup="stopIncrease"
              @mouseleave="stopIncrease"
            />
            <div class="text-base-content border-base-300 border-b font-mono text-3xl font-bold">{{ hours.toString().padStart(2, "0") }}</div>
            <BaseButton
              icon="chevron-down"
              size="sm"
              variant="ghost"
              @mousedown="startDecrease('hours')"
              @mouseup="stopDecrease"
              @mouseleave="stopDecrease"
            />
          </div>

          <div class="text-base-content font-mono text-xl font-bold">:</div>

          <div class="flex flex-col items-center justify-center">
            <BaseButton
              icon="chevron-up"
              size="sm"
              variant="ghost"
              @mousedown="startIncrease('minutes')"
              @mouseup="stopIncrease"
              @mouseleave="stopIncrease"
            />
            <div class="text-base-content border-base-300 border-b font-mono text-3xl font-bold">{{ minutes.toString().padStart(2, "0") }}</div>
            <BaseButton
              icon="chevron-down"
              size="sm"
              variant="ghost"
              @mousedown="startDecrease('minutes')"
              @mouseup="stopDecrease"
              @mouseleave="stopDecrease"
            />
          </div>
        </div>
      </div>

      <div v-if="estimatedTime > 0" class="mt-2 flex flex-wrap gap-2 p-2">
        <BaseButton variant="ghost" class="flex-1" icon="plus"></BaseButton>
        <BaseButton variant="ghost" class="flex-1" icon="minus"></BaseButton>
        <BaseButton variant="outline" class="text-error border-error hover:bg-error/30 w-full" icon="trash"></BaseButton>
      </div>

      <div v-else class="mt-2 flex flex-wrap gap-2 p-2">
        <BaseButton
          variant="outline"
          size="sm"
          class="border-accent/60 text-accent/60 bg-accent/10 hover:bg-accent/20 hover:border-accent/80 hover:text-accent/80 flex-1"
          icon="plus"
          >Estimate</BaseButton
        >
      </div>

      <div
        v-if="estimatedTime > 0"
        class="border-base-content/30 text-base-content/60 flex flex-col items-center gap-2 border-t pt-2 font-mono font-bold"
      >
        <span class="uppercase">Current estimated time</span>
        <span class="text-accent/60">{{ formatDuration(estimatedTime) }}</span>
      </div>
    </div>
  </BasePopup>
</template>
