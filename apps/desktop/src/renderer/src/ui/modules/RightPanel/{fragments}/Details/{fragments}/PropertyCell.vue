<script setup lang="ts">
import BaseButton from "@/ui/base/BaseButton"
import BaseIcon from "@/ui/base/BaseIcon"
import {cn} from "@/utils/ui/tailwindcss"

defineProps<{
  label: string
  isEmpty?: boolean
  /** Puts a cross after the label that emits `remove` instead of `click`. */
  removable?: boolean
}>()

const emit = defineEmits<{click: []; remove: []}>()

function onRemove(event: Event) {
  event.stopPropagation()
  emit("remove")
}

function getCellVariant(isEmpty?: boolean) {
  return isEmpty ? "cell-muted" : "cell"
}

function getLabelClasses(removable?: boolean) {
  return cn("min-w-0 truncate text-left leading-none", !removable && "flex-1")
}
</script>

<template>
  <BaseButton :variant="getCellVariant(isEmpty)" class="w-full min-w-0" @click="emit('click')">
    <slot name="icon" />
    <span :class="getLabelClasses(removable)">{{ label }}</span>
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
