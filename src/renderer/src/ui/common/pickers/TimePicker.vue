<script lang="ts" setup>
import {computed} from "vue"

import {withRepeatAction} from "@/utils/withRepeatAction"
import BaseButton from "@/ui/base/BaseButton.vue"
import BasePopup from "@/ui/base/BasePopup.vue"
import NumberInput from "@/ui/common/inputs/NumberInput.vue"

const props = withDefaults(
  defineProps<{
    title?: string
    time?: number
    min?: number
    max?: number
    inline?: boolean
  }>(),
  {
    title: "Select Time",
    time: 0,
    min: 0,
    max: 59,
  },
)

const emit = defineEmits<{"update:time": [time: number]; close: []}>()

const value = computed({
  get: () => props.time,
  set: (time: number) => emit("update:time", time),
})

const {start: startIncrease, stop: stopIncrease} = withRepeatAction(onIncrease, {initialDelay: 300, interval: 30})
const {start: startDecrease, stop: stopDecrease} = withRepeatAction(onDecrease, {initialDelay: 300, interval: 30})

function onIncrease() {
  value.value = Math.min(value.value + 1, props.max)
}

function onDecrease() {
  value.value = Math.max(value.value - 1, props.min)
}
</script>

<template>
  <div v-if="inline" class="flex flex-col items-center gap-2 text-xs">
    <div class="text-base-content/60 flex flex-col items-center justify-center gap-2 font-mono font-bold">
      <BaseButton icon="chevron-up" size="sm" variant="ghost" @mousedown="startIncrease" @mouseup="stopIncrease" @mouseleave="stopIncrease" />
      <NumberInput v-model="value" :min="props.min" :max="props.max" class="text-base-content bg-base-100 font-mono text-2xl font-bold" />
      <BaseButton icon="chevron-down" size="sm" variant="ghost" @mousedown="startDecrease" @mouseup="stopDecrease" @mouseleave="stopDecrease" />
    </div>
  </div>

  <BasePopup v-else hide-header container-class="p-0 min-w-20" position="center" content-class="p-0 py-2" @close="emit('close')">
    <template #trigger="{toggle, hide, show}">
      <slot name="trigger" :toggle="toggle" :hide="hide" :show="show" />
    </template>

    <div class="flex flex-col items-center gap-2 text-xs">
      <div class="text-base-content/60 flex flex-col items-center justify-center gap-2 font-mono font-bold">
        <BaseButton icon="chevron-up" size="sm" variant="ghost" @mousedown="startIncrease" @mouseup="stopIncrease" @mouseleave="stopIncrease" />
        <NumberInput v-model="value" :min="props.min" :max="props.max" class="text-base-content bg-base-100 font-mono text-2xl font-bold" />
        <BaseButton icon="chevron-down" size="sm" variant="ghost" @mousedown="startDecrease" @mouseup="stopDecrease" @mouseleave="stopDecrease" />
      </div>
    </div>
  </BasePopup>
</template>
