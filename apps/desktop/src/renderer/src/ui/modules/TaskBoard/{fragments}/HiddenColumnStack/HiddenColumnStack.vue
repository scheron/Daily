<script setup lang="ts">
import {computed, toRef, useTemplateRef} from "vue"

import BaseButton from "@/ui/base/BaseButton"
import BaseIcon from "@/ui/base/BaseIcon.vue"
import {cn} from "@/utils/ui/tailwindcss"
import {useHiddenColumnPlacement} from "./composables/useHiddenColumnPlacement"

import type {TaskStatus} from "@daily/protocol"
import type {HiddenColumn} from "../../types"

const props = defineProps<{side: "left" | "right"; columns: HiddenColumn[]; hoveredChipStatus: TaskStatus | null; obstacle?: HTMLElement | null}>()
const emit = defineEmits<{reveal: [status: TaskStatus]}>()

const stackRef = useTemplateRef<HTMLElement>("stack")

const {placementStyle, isObscured} = useHiddenColumnPlacement(stackRef, toRef(props, "obstacle"))

const stackClass = computed(() => cn("top-25 absolute z-10 flex flex-col gap-2", [props.side === "left" ? "left-4" : "right-4"]))
const buttonClass = computed(() => cn({"flex-row-reverse": props.side === "right"}))

function getButtonVariant(status: TaskStatus) {
  return props.hoveredChipStatus === status ? "dock-drop" : "dock"
}

function getBorderClasses(cardBorderClass: string) {
  return cn("absolute -inset-px rounded-[inherit] border transition-colors duration-150", cardBorderClass)
}

function getIconClasses(titleClass: string) {
  return cn("size-4 shrink-0", titleClass)
}

function getCounterClasses(counterClass: string) {
  return cn("shrink-0 rounded-full px-2 py-0.5 text-xs font-medium", counterClass)
}
</script>

<template>
  <nav
    v-if="columns.length"
    ref="stack"
    :style="placementStyle"
    :inert="isObscured || undefined"
    :aria-label="`Hidden columns to the ${side}`"
    :data-side="side"
    :class="stackClass"
  >
    <BaseButton
      v-for="column in columns"
      :key="column.status"
      type="button"
      :variant="getButtonVariant(column.status)"
      size="dock"
      :data-hidden-column-status="column.status"
      :aria-label="`Scroll ${side} to ${column.label}, ${column.count} ${column.count === 1 ? 'task' : 'tasks'}`"
      :class="buttonClass"
      @click="emit('reveal', column.status)"
    >
      <span aria-hidden="true" :class="getBorderClasses(column.cardBorderClass)" />
      <BaseIcon :name="side === 'left' ? 'chevron-left' : 'chevron-right'" class="hidden-column-chevron text-base-content/60 size-3.5 shrink-0" />
      <BaseIcon :name="column.icon" :class="getIconClasses(column.titleClass)" />
      <span :class="getCounterClasses(column.counterClass)">{{ column.count }}</span>
    </BaseButton>
  </nav>
</template>

<style scoped>
.hidden-column-chevron {
  animation: hidden-column-bounce-right 2.2s infinite;
}

[data-side="left"] .hidden-column-chevron {
  animation-name: hidden-column-bounce-left;
}

@keyframes hidden-column-bounce-right {
  0%,
  100% {
    transform: translateX(25%);
    animation-timing-function: cubic-bezier(0.8, 0, 1, 1);
  }
  50% {
    transform: none;
    animation-timing-function: cubic-bezier(0, 0, 0.2, 1);
  }
}

@keyframes hidden-column-bounce-left {
  0%,
  100% {
    transform: translateX(-25%);
    animation-timing-function: cubic-bezier(0.8, 0, 1, 1);
  }
  50% {
    transform: none;
    animation-timing-function: cubic-bezier(0, 0, 0.2, 1);
  }
}
</style>
