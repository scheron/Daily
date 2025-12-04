<script setup lang="ts">
import BaseInput from "@/ui/base/BaseInput.vue"

defineProps<{
  modelValue: string
  placeholder?: string
  maxlength?: number
}>()

const emit = defineEmits<{
  "update:modelValue": [value: string]
}>()

function onKeyDown(event: KeyboardEvent) {
  if (event.key === " ") {
    event.preventDefault()
    return
  }

  const allowedKeys = ["Backspace", "Delete", "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Tab", "Enter", "Home", "End"]

  const isAllowedKey = allowedKeys.includes(event.key)
  const isLetterOrDigit = /^[a-zA-Zа-яА-Я0-9]$/.test(event.key)
  const isHyphenOrUnderscore = event.key === "-" || event.key === "_"

  if (!isAllowedKey && !isLetterOrDigit && !isHyphenOrUnderscore) {
    event.preventDefault()
  }
}

function onInput(event: Event) {
  const target = event.target as HTMLInputElement
  emit("update:modelValue", target.value)
}
</script>

<template>
  <BaseInput
    :model-value="modelValue"
    type="text"
    focus-on-mount
    :maxlength="maxlength || 50"
    :placeholder="placeholder || 'Tag name'"
    @keydown="onKeyDown"
    @input="onInput"
  />
</template>
