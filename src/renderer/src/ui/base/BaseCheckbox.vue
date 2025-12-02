<script setup lang="ts">
import {computed} from "vue"

import {cn} from "@/utils/ui/tailwindcss"

import BaseIcon from "./BaseIcon"

const props = withDefaults(
  defineProps<{
    modelValue?: boolean
    disabled?: boolean
    size?: "sm" | "md" | "lg"
    class?: string
  }>(),
  {
    modelValue: false,
    disabled: false,
    size: "md",
    class: "",
  },
)

const emit = defineEmits<{
  "update:modelValue": [value: boolean]
}>()

const sizeClasses = {
  sm: "size-3",
  md: "size-4",
  lg: "size-5",
}

const iconSizeClasses = {
  sm: "size-3",
  md: "size-4",
  lg: "size-5",
}

const classes = computed(() =>
  cn(
    "relative flex items-center justify-center rounded border-2 transition-all duration-200",
    "hover:border-base-content/80 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/20 focus-visible:ring-offset-2",
    sizeClasses[props.size],
    props.modelValue ? "border-accent/60 bg-accent/30  text-accent hover:border-accent/70" : "border-base-content/50 text-transparent",
    props.disabled && "opacity-50 hover:border-base-content/30 hover:bg-transparent",
    props.class,
  ),
)

function toggle() {
  if (!props.disabled) {
    emit("update:modelValue", !props.modelValue)
  }
}

function onKeyDown(event: KeyboardEvent) {
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault()
    toggle()
  }
}
</script>

<template>
  <button type="button" :class="classes" :disabled="disabled" @click.self="toggle" @keydown.self="onKeyDown">
    <BaseIcon name="check" :class="iconSizeClasses[size]" />
  </button>
</template>
