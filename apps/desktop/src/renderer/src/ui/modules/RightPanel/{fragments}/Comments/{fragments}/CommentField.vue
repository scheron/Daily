<script setup lang="ts">
import {onMounted, useTemplateRef} from "vue"

import BaseButton from "@/ui/base/BaseButton"
import {SHORTCUTS_MAP} from "@shared/constants/shortcuts"
import {acceleratorsMatch} from "@shared/utils/shortcuts/acceleratorsMatch"
import {formatEventToAccelerator} from "@shared/utils/shortcuts/formatEventToAccelerator"

import type {IconName} from "@/ui/base/BaseIcon"

defineProps<{submitText: string; hintKey: string; hintText: string; placeholder?: string; submitIcon?: IconName}>()

const emit = defineEmits<{submit: []; cancel: []}>()

const draft = defineModel<string>({required: true})

const fieldRef = useTemplateRef<HTMLTextAreaElement>("field")

function onKeydown(event: KeyboardEvent) {
  const pressed = formatEventToAccelerator(event)
  if (!pressed) return

  if (acceleratorsMatch(pressed, SHORTCUTS_MAP["comments:cancel"].accelerator)) {
    emit("cancel")
  } else if (acceleratorsMatch(pressed, SHORTCUTS_MAP["comments:submit"].accelerator)) {
    emit("submit")
  } else {
    return
  }

  event.stopPropagation()
  event.preventDefault()
}

onMounted(() => {
  fieldRef.value?.focus()
  fieldRef.value?.setSelectionRange(draft.value.length, draft.value.length)
})
</script>

<template>
  <div>
    <textarea
      ref="field"
      v-model="draft"
      rows="3"
      :placeholder="placeholder"
      class="border-base-300 bg-base-100 text-base-content placeholder:text-base-content/50 focus:border-accent/60 block w-full resize-none rounded-lg border px-3 py-1.5 text-sm leading-normal outline-none select-text"
      @keydown="onKeydown"
    />

    <div class="mt-1.5 flex items-center gap-2">
      <span class="text-base-content/40 text-[11px]">
        <span class="bg-base-content/10 rounded px-1 py-px font-mono text-[11px]">{{ hintKey }}</span>
        {{ hintText }}
      </span>

      <div aria-hidden="true" class="flex-1" />

      <BaseButton variant="text" size="sm" @click="emit('cancel')">Cancel</BaseButton>
      <BaseButton variant="primary" size="sm" :icon="submitIcon" @click="emit('submit')">
        {{ submitText }}
      </BaseButton>
    </div>
  </div>
</template>
