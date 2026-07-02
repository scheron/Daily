<script setup lang="ts">
import {ref, watch} from "vue"

import BaseIcon from "@/ui/base/BaseIcon"

import ToolCallCard from "./ToolCallCard.vue"

import type {AgentMessageSegment} from "@shared/types/ai"

type ToolSegment = Extract<AgentMessageSegment, {kind: "tool"}>

const props = defineProps<{
  /** Consecutive tool segments rendered as one collapsible group. */
  tools: ToolSegment[]
  /** True while this group is the live/active block (drives the initial expand). */
  streaming?: boolean
}>()

const isOpen = ref(Boolean(props.streaming))

watch(
  () => props.streaming,
  (streaming, prev) => {
    if (streaming) isOpen.value = true
    else if (prev === true && streaming === false) isOpen.value = false
  },
)
</script>

<template>
  <div class="border-base-300 rounded border-l-2 py-1 pl-3">
    <button
      class="text-base-content/50 hover:text-base-content/70 flex w-full items-center gap-1.5 text-xs font-medium"
      type="button"
      @click="isOpen = !isOpen"
    >
      <BaseIcon name="chevron-right" class="size-3 shrink-0 transition-transform" :class="{'rotate-90': isOpen}" />
      <BaseIcon name="tool" class="size-3 shrink-0" />
      <span>Tools Used</span>
    </button>

    <div v-if="isOpen" class="mt-1 flex flex-col gap-0.5 pl-0.5">
      <ToolCallCard v-for="tool in tools" :key="tool.toolCallId" :segment="tool" />
    </div>
  </div>
</template>
