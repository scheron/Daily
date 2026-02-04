<script setup lang="ts">
import {computed, onMounted, useTemplateRef} from "vue"

const props = defineProps<{
  modelValue: string
  placeholder?: string
  type?: string
  disabled?: boolean
  class?: string
  focusOnMount?: boolean
}>()

const emit = defineEmits<{
  "update:modelValue": [string]
  "keyup.enter": []
}>()

const inputRef = useTemplateRef<HTMLInputElement>("input")

const classes = computed(() => [
  "w-full px-3 py-1.5 rounded-lg bg-base-100 border border-base-300",
  "focus-visible-ring focus-visible:ring-offset-base-100 focus-visible:ring-accent/80",
  "disabled:opacity-50 disabled:cursor-not-allowed outline-none",
  "placeholder:text-base-content/50",
  props.class,
])

function onInput(e: Event) {
  const target = e.target as HTMLInputElement
  emit("update:modelValue", target.value)
}

function onKeyup(e: KeyboardEvent) {
  if (e.key === "Enter") {
    emit("keyup.enter")
  }
}

onMounted(() => props.focusOnMount && inputRef.value?.focus())
</script>

<template>
  <input
    ref="input"
    :type="type ?? 'text'"
    :value="modelValue"
    :placeholder="placeholder"
    :disabled="disabled"
    :class="classes"
    @input="onInput"
    @keyup="onKeyup"
  />
</template>
