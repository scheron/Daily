<script setup lang="ts">
import {computed} from "vue"

import {cn} from "@/utils/ui/tailwindcss"

const props = defineProps<{
  modelValue: boolean
  disabled?: boolean
}>()

const emit = defineEmits<{"update:modelValue": [boolean]}>()

const trackStyle = computed(() => {
  return {
    boxShadow: "0 0 1px 0 rgba(0, 0, 0, 0.4) inset",
    backgroundColor: props.modelValue ? "var(--color-accent)" : "var(--color-base-300)",
  }
})

const rootClass = computed(() =>
  cn("focus-visible-accent inline-flex cursor-pointer items-center rounded-xl border border-transparent outline-none", {
    "cursor-default opacity-50": props.disabled,
  }),
)
const thumbClass = computed(() =>
  cn("absolute top-1/2 z-20 -translate-y-1/2 rounded-full bg-white shadow-sm transition-all duration-300 size-4", [
    props.modelValue ? "left-[18px]" : "left-0.5",
  ]),
)

function toggle() {
  if (props.disabled) return
  emit("update:modelValue", !props.modelValue)
}
</script>

<template>
  <div :tabindex="disabled ? -1 : 0" :class="rootClass" role="button" @click="toggle" @keydown.enter="toggle" @keydown.space="toggle">
    <div class="relative h-[20px] w-[36px] rounded-full transition-colors duration-300" :style="trackStyle">
      <div :class="thumbClass" />
    </div>
  </div>
</template>
