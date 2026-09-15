<script setup lang="ts">
import {computed} from "vue"

import {cn} from "@/utils/ui/tailwindcss"

const props = defineProps<{
  modelValue: boolean
}>()

const emit = defineEmits<{"update:modelValue": [boolean]}>()

const trackStyle = computed(() => {
  return {
    boxShadow: "0 0 1px 0 rgba(0, 0, 0, 0.4) inset",
    backgroundColor: props.modelValue ? "var(--color-accent)" : "var(--color-base-300)",
  }
})

function toggle() {
  emit("update:modelValue", !props.modelValue)
}

function getThumbClasses(isOn: boolean) {
  return cn(
    "absolute top-1/2 z-20 -translate-y-1/2 rounded-full bg-white shadow-sm transition-all duration-300 size-4",
    isOn ? "left-[18px]" : "left-0.5",
  )
}
</script>

<template>
  <div
    tabindex="0"
    class="focus-visible-accent inline-flex cursor-pointer items-center rounded-xl border border-transparent outline-none"
    role="button"
    @click="toggle"
    @keydown.enter="toggle"
    @keydown.space="toggle"
  >
    <div class="relative h-[20px] w-[36px] rounded-full transition-colors duration-300" :style="trackStyle">
      <div :class="getThumbClasses(modelValue)" />
    </div>
  </div>
</template>
