<script setup lang="ts">
import {reactive, watch} from "vue"

import BaseButton from "@/ui/base/BaseButton"
import BaseIcon from "@/ui/base/BaseIcon"
import TimePicker from "@/ui/common/pickers/TimePicker.vue"

const props = defineProps<{
  /** Current time, in seconds */
  modelValue: number
}>()

const emit = defineEmits<{
  "update:modelValue": [value: number]
}>()

const presets = [
  {minutes: 15, label: "15m"},
  {minutes: 30, label: "30m"},
  {minutes: 60, label: "1h"},
  {minutes: 120, label: "2h"},
]

const draft = reactive({hours: 0, minutes: 0})

function addTime(minutes: number) {
  emit("update:modelValue", props.modelValue + minutes * 60)
}

function subtractTime(minutes: number) {
  emit("update:modelValue", Math.max(0, props.modelValue - minutes * 60))
}

function resetDraft() {
  draft.hours = Math.floor(props.modelValue / 3600)
  draft.minutes = Math.floor((props.modelValue % 3600) / 60)
}

watch(() => props.modelValue, resetDraft, {immediate: true})
watch([() => draft.hours, () => draft.minutes], () => {
  const total = draft.hours * 3600 + draft.minutes * 60
  if (total !== props.modelValue) emit("update:modelValue", total)
})
</script>

<template>
  <div class="flex w-64 flex-col gap-2" @click.stop>
    <div class="grid grid-cols-4 gap-1">
      <BaseButton
        v-for="preset in presets"
        :key="`add-${preset.minutes}`"
        variant="ghost"
        class="bg-success/5 hover:bg-success/10 text-success border-success/20 justify-center rounded-md border px-1 py-1 font-mono text-xs"
        @click="addTime(preset.minutes)"
      >
        +{{ preset.label }}
      </BaseButton>

      <BaseButton
        v-for="preset in presets"
        :key="`sub-${preset.minutes}`"
        variant="ghost"
        class="bg-error/5 hover:bg-error/10 text-error border-error/20 justify-center rounded-md border px-1 py-1 font-mono text-xs"
        @click="subtractTime(preset.minutes)"
      >
        −{{ preset.label }}
      </BaseButton>
    </div>

    <div class="flex items-center justify-center gap-3 px-3 py-2">
      <TimePicker v-model:time="draft.hours" :min="0" :max="23" inline />
      <BaseIcon name="stopwatch" class="text-base-content/60 size-5" />
      <TimePicker v-model:time="draft.minutes" :min="0" :max="59" inline />
    </div>
  </div>
</template>
