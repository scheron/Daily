<script setup lang="ts">
import {computed} from "vue"

import BaseIcon from "@/ui/base/BaseIcon"

import type {AgentMessageSegment} from "@shared/types/ai"

const props = defineProps<{segment: Extract<AgentMessageSegment, {kind: "tool"}>}>()

const iconName = computed(() => {
  if (props.segment.status === "running") return "refresh"
  return props.segment.success ? "check" : "x-mark"
})
const iconClass = computed(() => {
  if (props.segment.status === "running") return "text-warning animate-spin"
  return props.segment.success ? "text-success" : "text-error"
})
const display = computed(() => {
  const s = props.segment
  if (s.name === "read_url" && s.status === "running") {
    return s.label ? `Reading «${s.label}»` : "Reading a web page…"
  }
  return s.name
})
</script>

<template>
  <div class="flex min-w-0 items-center gap-1.5 py-0.5">
    <BaseIcon :name="iconName" :class="iconClass" class="size-3 shrink-0" />
    <span class="text-base-content/70 truncate font-mono text-xs">{{ display }}</span>
  </div>
</template>
