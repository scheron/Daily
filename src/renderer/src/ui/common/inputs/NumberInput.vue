<script setup lang="ts">
import {computed, HtmlHTMLAttributes} from "vue"
import {cn} from "@/utils/ui/tailwindcss"

const props = withDefaults(
  defineProps<{
    modelValue: number
    max?: number
    placeholder?: string
    class?: HtmlHTMLAttributes["class"]
  }>(),
  {
    max: Infinity,
    placeholder: "0",
  },
)

const emit = defineEmits<{"update:modelValue": [value: number]}>()

const classes = computed(() =>
  cn([
    "bg-base-200 text-base-content focus:ring-accent w-16 rounded px-1.5 py-0.5 text-center font-mono text-xs focus:ring-1 focus:outline-none",
    props.class,
  ]),
)

function onInput(event: Event) {
  const input = event.target as HTMLInputElement
  let value = input.value.replace(/[^0-9]/g, "")

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
  const currentValue = input.value.replace(/[^0-9]/g, "")
  const selectionStart = input.selectionStart ?? 0
  const selectionEnd = input.selectionEnd ?? 0
  const inputData = event.data || ""

  if (event.inputType === "deleteContentBackward" || event.inputType === "deleteContentForward" || event.inputType === "deleteByCut") return

  const numericData = inputData.replace(/[^0-9]/g, "")
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
    :placeholder="placeholder"
    :class="classes"
    @input="onInput"
    @beforeinput="onBeforeInput"
  />
</template>
