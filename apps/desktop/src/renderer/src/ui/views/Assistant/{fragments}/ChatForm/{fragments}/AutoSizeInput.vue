<script setup lang="ts">
import {computed, nextTick, onMounted, useTemplateRef, watch} from "vue"
import {until} from "@vueuse/core"

const props = defineProps<{placeholder: string; modelValue: string}>()
const emit = defineEmits<{
  "update:modelValue": [value: string]
}>()

const textareaRef = useTemplateRef<HTMLTextAreaElement>("textarea")

const value = computed({
  get: () => props.modelValue,
  set: (value) => emit("update:modelValue", value),
})

async function adjustHeight() {
  await nextTick()
  if (!textareaRef.value) return

  textareaRef.value.style.height = "auto"
  const newHeight = Math.min(textareaRef.value.scrollHeight, 200)
  textareaRef.value.style.height = newHeight + "px"

  if (textareaRef.value.scrollHeight > 200) {
    textareaRef.value.style.overflowY = "auto"
  } else {
    textareaRef.value.style.overflowY = "hidden"
  }
}

watch(() => props.modelValue, adjustHeight)

onMounted(async () => {
  await until(textareaRef).toBeTruthy()
  await adjustHeight()
})
</script>

<template>
  <textarea
    ref="textarea"
    v-model="value"
    :placeholder="placeholder"
    class="placeholder:text-base-content/40 text-base-content w-full flex-1 resize-none overflow-hidden bg-transparent px-3 py-2 text-sm outline-none"
    rows="1"
    @input="adjustHeight"
  ></textarea>
</template>
