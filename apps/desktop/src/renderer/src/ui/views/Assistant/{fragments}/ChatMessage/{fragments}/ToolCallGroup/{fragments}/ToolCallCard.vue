<script setup lang="ts">
import {computed} from "vue"

import BaseIcon from "@/ui/base/BaseIcon"
import {cn} from "@/utils/ui/tailwindcss"

import type {ToolSegment} from "../../../types"

const props = defineProps<{segment: ToolSegment}>()

const iconName = computed(() => {
  if (props.segment.status === "running") return "refresh"
  return props.segment.success ? "check" : "x-mark"
})
const display = computed(() => {
  const s = props.segment
  if (s.name === "read_url" && s.status === "running") {
    return s.label ? `Reading «${s.label}»` : "Reading a web page…"
  }
  return s.name
})

function getIconClasses(isRunning: boolean, isSuccess: boolean | undefined) {
  return cn("size-3 shrink-0", isRunning ? "text-warning animate-spin" : isSuccess ? "text-success" : "text-error")
}
</script>

<template>
  <div class="flex min-w-0 items-center gap-1.5 py-0.5">
    <BaseIcon :name="iconName" :class="getIconClasses(segment.status === 'running', segment.success)" />
    <span class="text-base-content/70 truncate font-mono text-xs">{{ display }}</span>
  </div>
</template>
