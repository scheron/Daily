<script setup lang="ts">
import {onMounted, useTemplateRef} from "vue"

defineProps<{
  modelValue: string
  placeholder?: string
  maxlength?: number
}>()

const emit = defineEmits<{
  "update:modelValue": [value: string]
}>()

const inputRef = useTemplateRef<HTMLInputElement>("input")

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

onMounted(() => inputRef.value?.focus())
</script>

<template>
  <input
    ref="input"
    :value="modelValue"
    type="text"
    :maxlength="maxlength || 50"
    :placeholder="placeholder || 'Tag name'"
    class="bg-base-100 border-base-300 focus:ring-primary/20 focus:border-primary/50 h-8 w-full rounded-lg border px-3 py-1.5 text-sm focus:ring-1 focus:outline-none"
    @keydown="onKeyDown"
    @input="onInput"
  />
</template>
