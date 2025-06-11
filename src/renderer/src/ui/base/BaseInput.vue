<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  modelValue: string
  placeholder?: string
  type?: string
  disabled?: boolean
  class?: string
}>()

const emit = defineEmits<{
  'update:modelValue': [string]
  'keyup.enter': []
}>()

const classes = computed(() => [
  'w-full px-3 py-1.5 rounded-lg bg-base-100 border border-base-300',
  'focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/50',
  'disabled:opacity-50 disabled:cursor-not-allowed',
  'placeholder:text-base-content/50',
  props.class
])

function onInput(e: Event) {
  const target = e.target as HTMLInputElement
  emit('update:modelValue', target.value)
}

function onKeyup(e: KeyboardEvent) {
  if (e.key === 'Enter') {
    emit('keyup.enter')
  }
}
</script>

<template>
  <input
    :type="type ?? 'text'"
    :value="modelValue"
    :placeholder="placeholder"
    :disabled="disabled"
    :class="classes"
    @input="onInput"
    @keyup="onKeyup"
  />
</template> 