<script setup lang="ts">
import {computed} from "vue"

import BaseButton from "@/ui/base/BaseButton"
import BaseIcon from "@/ui/base/BaseIcon.vue"
import {cn} from "@/utils/ui/tailwindcss"

const props = defineProps<{
  label: string
  isEmpty?: boolean
  /** Puts a cross after the label that emits `remove` instead of `click`. */
  removable?: boolean
}>()

const emit = defineEmits<{click: []; remove: []}>()

const labelClass = computed(() => cn("min-w-0 truncate text-left leading-none", {"flex-1": !props.removable}))

function onRemove(event: Event) {
  event.stopPropagation()
  emit("remove")
}

function getCellVariant(isEmpty?: boolean) {
  return isEmpty ? "cell-muted" : "cell"
}
</script>

<template>
  <BaseButton :variant="getCellVariant(isEmpty)" class="w-full min-w-0" @click="emit('click')">
    <slot name="icon" />
    <span :class="labelClass">{{ label }}</span>
    <span
      v-if="removable"
      class="text-base-content/50 hover:bg-base-content/15 hover:text-base-content inline-flex size-3.5 shrink-0 cursor-pointer items-center justify-center rounded-full"
      role="button"
      tabindex="0"
      :aria-label="`Remove ${label}`"
      @click="onRemove"
      @keydown.enter.prevent="onRemove"
    >
      <BaseIcon name="x" class="size-3" />
    </span>
  </BaseButton>
</template>
