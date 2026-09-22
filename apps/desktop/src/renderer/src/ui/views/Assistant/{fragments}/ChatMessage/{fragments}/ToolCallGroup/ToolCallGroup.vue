<script setup lang="ts">
import {ref, watch} from "vue"

import BaseButton from "@/ui/base/BaseButton"
import BaseIcon from "@/ui/base/BaseIcon"
import {cn} from "@/utils/ui/tailwindcss"
import ToolCallCard from "./{fragments}/ToolCallCard.vue"

import type {ToolSegment} from "../../types"

const props = defineProps<{
  tools: ToolSegment[]
  /** Opens the group while streaming and collapses it when streaming ends. */
  streaming?: boolean
}>()

const isOpen = ref(Boolean(props.streaming))

function getChevronClasses(isOpen: boolean) {
  return cn("size-3 shrink-0 transition-transform", isOpen && "rotate-90")
}

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
    <BaseButton variant="inline" size="xs" class="w-full" @click="isOpen = !isOpen">
      <BaseIcon name="chevron-right" :class="getChevronClasses(isOpen)" />
      <BaseIcon name="tool" class="size-3 shrink-0" />
      <span>Tools Used</span>
    </BaseButton>

    <div v-if="isOpen" class="mt-1 flex flex-col gap-0.5 pl-0.5">
      <ToolCallCard v-for="tool in tools" :key="tool.toolCallId" :segment="tool" />
    </div>
  </div>
</template>
