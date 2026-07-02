<script setup lang="ts">
import {computed} from "vue"

import {cn} from "@/utils/ui/tailwindcss"
import BaseIcon from "@/ui/base/BaseIcon"

import {checkboxBaseVariant, checkboxColorVariant, checkboxIconVariant} from "./variants"

import type {CheckboxColorVariant, CheckboxSize} from "./variants"

const props = withDefaults(
  defineProps<{
    modelValue?: boolean
    variant?: CheckboxColorVariant
    size?: CheckboxSize
    disabled?: boolean
    class?: string
  }>(),
  {
    modelValue: false,
    variant: "primary",
    size: "md",
    disabled: false,
    class: "",
  },
)

const emit = defineEmits<{
  "update:modelValue": [value: boolean]
}>()

const classes = computed(() => {
  const unchecked = "border-base-content/40 text-transparent hover:border-base-content/70"
  return cn(
    checkboxBaseVariant({size: props.size}).value,
    props.modelValue ? checkboxColorVariant({variant: props.variant}).value : unchecked,
    props.class,
  )
})

const iconClass = computed(() => checkboxIconVariant({size: props.size}).value)

function toggle() {
  if (!props.disabled) emit("update:modelValue", !props.modelValue)
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
    <BaseIcon name="check" :class="iconClass" />
  </button>
</template>
