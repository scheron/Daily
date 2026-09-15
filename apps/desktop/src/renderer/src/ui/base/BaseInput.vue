<script setup lang="ts">
import {onMounted, useTemplateRef} from "vue"

import {sleep} from "@daily/std"

import {cn} from "@/utils/ui/tailwindcss"

const props = defineProps<{
  modelValue: string
  placeholder?: string
  type?: string
  class?: string
  focusOnMount?: boolean
  hideOutline?: boolean
  /** Strip the border, background and padding for an inline, transparent field. */
  bare?: boolean
}>()

const emit = defineEmits<{
  "update:modelValue": [string]
}>()

const inputRef = useTemplateRef<HTMLInputElement>("input")

function getInputClasses() {
  return cn(
    props.bare ? "w-full bg-transparent" : "w-full px-3 py-1.5 rounded-lg bg-base-100 border border-base-300",
    !props.hideOutline && "focus-visible-accent",
    "disabled:opacity-50 disabled:cursor-not-allowed outline-none",
    "placeholder:text-base-content/50",
    props.class,
  )
}

function onInput(e: Event) {
  const target = e.target as HTMLInputElement
  emit("update:modelValue", target.value)
}

function focus() {
  inputRef.value?.focus()
}

onMounted(async () => {
  if (props.focusOnMount) {
    await sleep(100)
    inputRef.value?.focus()
  }
})

defineExpose({focus})
</script>

<template>
  <input ref="input" :type="type ?? 'text'" :value="modelValue" :placeholder="placeholder" :class="getInputClasses()" @input="onInput" />
</template>
