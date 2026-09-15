<script setup lang="ts">
import BaseIcon from "@/ui/base/BaseIcon"
import {cn} from "@/utils/ui/tailwindcss"

const props = withDefaults(
  defineProps<{
    modelValue?: boolean
    class?: string
  }>(),
  {
    modelValue: false,
    class: "",
  },
)

function getCheckboxClasses(isChecked: boolean) {
  return cn(
    "relative flex items-center justify-center rounded-[4px] border outline-none focus-visible-accent transition-all duration-200 disabled:pointer-events-none disabled:opacity-50 size-4",
    isChecked ? "border-accent bg-accent text-white" : "border-base-content/40 text-transparent hover:border-base-content/70",
    props.class,
  )
}

function onKeyDown(event: KeyboardEvent) {
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault()
  }
}
</script>

<template>
  <button type="button" :class="getCheckboxClasses(modelValue)" @keydown.self="onKeyDown">
    <BaseIcon name="check" class="size-3" />
  </button>
</template>
