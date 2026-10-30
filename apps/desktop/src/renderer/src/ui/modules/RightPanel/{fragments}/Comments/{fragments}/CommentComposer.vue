<script setup lang="ts">
import {computed, nextTick, ref, useTemplateRef, watch} from "vue"

import BaseButton from "@/ui/base/BaseButton"
import {SHORTCUTS_MAP} from "@shared/constants/shortcuts"
import {acceleratorsMatch} from "@shared/utils/shortcuts/acceleratorsMatch"
import {formatEventToAccelerator} from "@shared/utils/shortcuts/formatEventToAccelerator"

const MAX_HEIGHT_PX = 6 * 20 + 10

const emit = defineEmits<{submit: [string]}>()

const fieldRef = useTemplateRef<HTMLTextAreaElement>("field")

const draft = ref("")
const isFocused = ref(false)

const isOpen = computed(() => isFocused.value || !!draft.value)

function submit() {
  const content = draft.value.trim()
  if (content) emit("submit", content)
  clear()
}

function clear() {
  draft.value = ""
  fieldRef.value?.blur()
}

function onKeydown(event: KeyboardEvent) {
  const pressed = formatEventToAccelerator(event)
  if (!pressed) return

  if (acceleratorsMatch(pressed, SHORTCUTS_MAP["comments:cancel"].accelerator)) {
    clear()
  } else if (acceleratorsMatch(pressed, SHORTCUTS_MAP["comments:submit"].accelerator)) {
    submit()
  } else {
    return
  }

  event.stopPropagation()
  event.preventDefault()
}

function grow() {
  const field = fieldRef.value
  if (!field) return
  field.style.height = "2rem"
  const natural = Math.max(field.scrollHeight, 32)
  field.style.height = `${Math.min(natural, MAX_HEIGHT_PX)}px`
  field.style.overflowY = natural > MAX_HEIGHT_PX ? "auto" : "hidden"
}

watch(draft, () => nextTick(grow))
</script>

<template>
  <div class="border-base-300 shrink-0 border-t px-4 pb-2.5 pt-2">
    <div class="border-base-300 bg-base-100 hover:border-base-content/20 focus-within:border-accent/60 rounded-lg border">
      <textarea
        ref="field"
        v-model="draft"
        rows="1"
        aria-label="Write a comment"
        placeholder="Write a comment…"
        class="text-base-content placeholder:text-base-content/50 block h-8 w-full select-text resize-none overflow-y-hidden bg-transparent px-3 py-[5px] text-sm leading-5 outline-none"
        @focus="isFocused = true"
        @blur="isFocused = false"
        @keydown="onKeydown"
      />

      <div v-if="isOpen" class="flex justify-end px-1.5 pb-1.5" @mousedown.prevent>
        <BaseButton variant="primary" size="sm" icon="arrow-up" aria-label="Send comment" :disabled="!draft.trim()" @click="submit" />
      </div>
    </div>
  </div>
</template>
