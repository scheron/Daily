<script setup lang="ts">
import {computed} from "vue"

import BaseIcon from "@/ui/base/BaseIcon"
import AgentIcon from "@/ui/common/sync/AgentIcon.vue"
import {cn} from "@/utils/ui/tailwindcss"

import type {TaskCommentKind} from "@daily/protocol"

const props = defineProps<{kind: TaskCommentKind; provider: string | null}>()

const label = computed(() => (props.kind === "manual" ? "Comment" : props.kind === "agent" ? "Daily Assistant" : props.provider?.trim() || "MCP"))

function getMarkerClasses(kind: TaskCommentKind) {
  return cn("source-marker flex size-5 shrink-0 items-center justify-center", kind === "manual" ? "text-base-content/70" : "text-accent")
}
</script>

<template>
  <span :class="getMarkerClasses(kind)" role="img" :aria-label="label" :data-source="label" tabindex="0">
    <BaseIcon v-if="kind === 'manual'" name="message" class="size-3.5" />
    <BaseIcon v-else-if="kind === 'agent'" name="logo" class="size-3.5" />
    <AgentIcon v-else :name="provider ?? ''" class="size-3.5" />
  </span>
</template>

<style scoped>
.source-marker {
  position: relative;
  border-radius: 999px;
}

.source-marker:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 2px;
}

.source-marker::after {
  content: attr(data-source);
  position: absolute;
  left: 0;
  bottom: calc(100% + 5px);
  z-index: 5;
  padding: 0.25rem 0.5rem;
  border-radius: 0.25rem;
  background: var(--color-base-content);
  color: var(--color-base-100);
  font-size: 0.75rem;
  white-space: nowrap;
  opacity: 0;
  visibility: hidden;
  pointer-events: none;
}

.source-marker:hover::after,
.source-marker:focus-visible::after {
  opacity: 1;
  visibility: visible;
}
</style>
