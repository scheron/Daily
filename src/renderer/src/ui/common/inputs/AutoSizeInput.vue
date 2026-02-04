<script setup lang="ts">
import {computed, HTMLAttributes, nextTick, onMounted, useTemplateRef} from "vue"
import {until} from "@vueuse/core"

import {cn} from "@/utils/ui/tailwindcss"

const props = withDefaults(defineProps<{maxHeight?: number; placeholder: string; modelValue: string; class?: HTMLAttributes["class"]}>(), {
  maxHeight: 300,
})
const emit = defineEmits<{
  "update:modelValue": [value: string]
}>()

const value = computed({
  get: () => props.modelValue,
  set: (value) => emit("update:modelValue", value),
})

const textareaRef = useTemplateRef<HTMLTextAreaElement>("textarea")

const inputClasses = computed(() => {
  const baseClasses =
    "placeholder:text-base-content/40 text-base-content w-full flex-1 resize-none overflow-hidden bg-transparent px-3 py-2 text-sm outline-none"
  return cn(baseClasses, props.class)
})

async function adjustHeight() {
  await nextTick()
  if (!textareaRef.value) return

  textareaRef.value.style.height = "auto"
  const newHeight = Math.min(textareaRef.value.scrollHeight, props.maxHeight)
  textareaRef.value.style.height = newHeight + "px"

  if (textareaRef.value.scrollHeight > props.maxHeight) {
    textareaRef.value.style.overflowY = "auto"
  } else {
    textareaRef.value.style.overflowY = "hidden"
  }
}

onMounted(async () => {
  await until(textareaRef).toBeTruthy()
  await adjustHeight()
})
</script>

<template>
  <textarea ref="textarea" v-model="value" :placeholder="placeholder" :class="inputClasses" rows="1" @input="adjustHeight"></textarea>
</template>
