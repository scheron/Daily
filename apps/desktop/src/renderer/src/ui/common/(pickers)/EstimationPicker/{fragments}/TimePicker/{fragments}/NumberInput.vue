<script setup lang="ts">
import {NON_DIGIT_REGEX} from "@/constants/regex"

const props = withDefaults(
  defineProps<{
    modelValue: number
    max?: number
  }>(),
  {
    max: Infinity,
  },
)

const emit = defineEmits<{"update:modelValue": [value: number]}>()

function onInput(event: Event) {
  const input = event.target as HTMLInputElement
  let value = input.value.replace(NON_DIGIT_REGEX, "")

  if (value === "") {
    emit("update:modelValue", 0)
    return
  }

  const numValue = parseInt(value)
  if (numValue > props.max) {
    emit("update:modelValue", props.max)
  } else {
    emit("update:modelValue", numValue)
  }
}

function onBeforeInput(event: InputEvent) {
  const input = event.target as HTMLInputElement
  const currentValue = input.value.replace(NON_DIGIT_REGEX, "")
  const selectionStart = input.selectionStart ?? 0
  const selectionEnd = input.selectionEnd ?? 0
  const inputData = event.data || ""

  if (event.inputType === "deleteContentBackward" || event.inputType === "deleteContentForward" || event.inputType === "deleteByCut") return

  const numericData = inputData.replace(NON_DIGIT_REGEX, "")
  if (numericData === "" && inputData !== "") {
    event.preventDefault()
    return
  }

  const beforeSelection = currentValue.substring(0, selectionStart)
  const afterSelection = currentValue.substring(selectionEnd)
  const newValue = beforeSelection + numericData + afterSelection

  if (newValue !== "") {
    const numValue = parseInt(newValue)
    if (numValue > props.max) {
      event.preventDefault()
      emit("update:modelValue", props.max)
      setTimeout(() => {
        input.setSelectionRange(input.value.length, input.value.length)
      }, 0)
    }
  }
}
</script>

<template>
  <input
    :value="modelValue"
    type="text"
    inputmode="numeric"
    placeholder="0"
    class="focus:ring-accent text-base-content bg-base-100 w-16 rounded px-1.5 py-0.5 text-center font-mono text-2xl font-bold focus:outline-none focus:ring-1"
    @input="onInput"
    @beforeinput="onBeforeInput"
  />
</template>
