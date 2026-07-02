<script setup lang="ts">
import {computed, onMounted, useTemplateRef} from "vue"

import {sleep} from "@shared/utils/common/sleep"

const props = defineProps<{
  modelValue: string
  placeholder?: string
  type?: string
  disabled?: boolean
  class?: string
  focusOnMount?: boolean
  /** Suppress the focus/tab outline (no accent ring); the native outline stays off too. */
  hideOutline?: boolean
  /** Strip the border, background and padding for an inline, transparent field. */
  bare?: boolean
}>()

const emit = defineEmits<{
  "update:modelValue": [string]
  "keyup.enter": []
}>()

const inputRef = useTemplateRef<HTMLInputElement>("input")

const classes = computed(() => [
  props.bare ? "w-full bg-transparent" : "w-full px-3 py-1.5 rounded-lg bg-base-100 border border-base-300",
  props.hideOutline ? "" : "focus-visible-accent",
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

function focus() {
  inputRef.value?.focus()
}

defineExpose({focus})

onMounted(async () => {
  if (props.focusOnMount) {
    await sleep(100)
    inputRef.value?.focus()
  }
})
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
