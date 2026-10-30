<script setup lang="ts">
import {toRef, useTemplateRef} from "vue"

import BaseButton from "@/ui/base/BaseButton"
import BaseIcon from "@/ui/base/BaseIcon"
import {cn} from "@/utils/ui/tailwindcss"
import {useHiddenColumnPlacement} from "./useHiddenColumnPlacement"

import type {TaskStatus} from "@daily/protocol"
import type {HiddenColumn} from "../../types"

const props = defineProps<{side: "left" | "right"; columns: HiddenColumn[]; obstacle?: HTMLElement | null}>()
const emit = defineEmits<{reveal: [status: TaskStatus]}>()

const stackRef = useTemplateRef<HTMLElement>("stack")

const {placementStyle, isObscured} = useHiddenColumnPlacement(stackRef, toRef(props, "obstacle"))

function getStackClasses(side: "left" | "right") {
  return cn("absolute bottom-4 z-10 flex flex-col gap-2", side === "left" ? "left-4" : "right-4")
}

function getButtonClasses(side: "left" | "right") {
  return cn(side === "right" && "flex-row-reverse")
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
    :class="getStackClasses(side)"
  >
    <BaseButton
      v-for="column in columns"
      :key="column.status"
      type="button"
      variant="dock"
      size="dock"
      :data-hidden-column-status="column.status"
      :aria-label="`Scroll ${side} to ${column.label}, ${column.count} ${column.count === 1 ? 'task' : 'tasks'}`"
      :class="getButtonClasses(side)"
      @click="emit('reveal', column.status)"
    >
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
