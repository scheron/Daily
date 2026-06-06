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
</script>

<template>
  <div class="bg-base-300/30 border-base-300/50 flex items-center gap-1.5 rounded border px-2 py-1">
    <BaseIcon :name="iconName" :class="iconClass" class="size-3" />
    <span class="text-base-content/60 font-mono text-xs">{{ segment.name }}</span>
  </div>
</template>
