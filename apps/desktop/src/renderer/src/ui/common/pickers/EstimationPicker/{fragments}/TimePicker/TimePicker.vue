<script setup lang="ts">
import {computed} from "vue"

import BaseButton from "@/ui/base/BaseButton"
import {withRepeatAction} from "./utils/withRepeatAction"
import NumberInput from "./{fragments}/NumberInput.vue"

const props = withDefaults(
  defineProps<{
    time?: number
    max?: number
  }>(),
  {
    time: 0,
    max: 59,
  },
)

const emit = defineEmits<{"update:time": [time: number]}>()

const value = computed({
  get: () => props.time,
  set: (time: number) => emit("update:time", time),
})

const {start: startIncrease, stop: stopIncrease} = withRepeatAction(onIncrease)
const {start: startDecrease, stop: stopDecrease} = withRepeatAction(onDecrease)

function onIncrease() {
  value.value = Math.min(value.value + 1, props.max)
}

function onDecrease() {
  value.value = Math.max(value.value - 1, 0)
}
</script>

<template>
  <div class="flex flex-col items-center gap-2 text-xs">
    <div class="text-base-content/60 flex flex-col items-center justify-center gap-2 font-mono font-bold">
      <BaseButton icon="chevron-up" variant="ghost" @mousedown="startIncrease" @mouseup="stopIncrease" @mouseleave="stopIncrease" />
      <NumberInput v-model="value" :max="props.max" />
      <BaseButton icon="chevron-down" variant="ghost" @mousedown="startDecrease" @mouseup="stopDecrease" @mouseleave="stopDecrease" />
    </div>
  </div>
</template>
