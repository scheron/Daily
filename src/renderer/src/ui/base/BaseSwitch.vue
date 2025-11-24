<script setup lang="ts">
import {computed} from "vue"
import {cn} from "@/utils/ui/tailwindcss"

import type {IconName} from "./BaseIcon"

const emit = defineEmits<{"update:modelValue": [boolean]}>()
const props = defineProps<{
  modelValue: boolean
  size?: "xs" | "sm" | "md" | "lg" | "xl"
  colorOn?: string
  colorOff?: string
  iconOff?: IconName
  iconOn?: IconName
  disabled?: boolean
}>()

const sizeClass = computed(() => {
  const sizes = {
    xs: {track: "w-[30px] h-[16px]", icon: "size-2", thumb: "size-3", thumbOffset: "left-[15px]"},
    sm: {track: "w-[36px] h-[20px]", icon: "size-3", thumb: "size-4", thumbOffset: "left-[18px] "},
    md: {track: "w-[48px] h-[24px]", icon: "size-4", thumb: "size-5", thumbOffset: "left-[26px]"},
    lg: {track: "w-[48px] h-[28px]", icon: "size-5", thumb: "size-6", thumbOffset: "left-[24px]"},
    xl: {track: "w-[56px] h-[32px]", icon: "size-6", thumb: "size-7", thumbOffset: "left-[28px]"},
  }
  return sizes[props.size ?? "sm"]
})

const trackStyle = computed(() => {
  return {
    boxShadow: "0 0 1px 0 rgba(0, 0, 0, 0.4) inset",
    backgroundColor: props.modelValue ? (props.colorOn ?? "var(--color-accent)") : (props.colorOff ?? "var(--color-base-300)"),
  }
})

function toggle() {
  if (props.disabled) return
  emit("update:modelValue", !props.modelValue)
}
</script>

<template>
  <div
    tabindex="0"
    class="focus-visible:ring-offset-base-100 focus-visible:ring-accent focus-visible-ring inline-flex items-center rounded-xl border border-transparent outline-none"
    role="button"
    :class="[disabled ? 'cursor-auto opacity-30' : 'cursor-pointer']"
    @click="toggle"
    @keydown.enter="toggle"
    @keydown.space="toggle"
  >
    <div class="relative rounded-full transition-colors duration-300" :class="[sizeClass.track, {'cursor-auto': disabled}]" :style="trackStyle">
      <div
        :class="
          cn(
            'absolute top-1/2 z-20 -translate-y-1/2 rounded-full bg-white shadow-sm transition-all duration-300',
            sizeClass.thumb,
            modelValue ? sizeClass.thumbOffset : 'left-0.5',
          )
        "
      />
    </div>
  </div>
</template>
