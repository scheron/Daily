<script setup lang="ts">
import {computed} from "vue"

import BaseIcon from "@/ui/base/BaseIcon"
import AgentIcon from "@/ui/common/sync/AgentIcon.vue"
import {cn} from "@/utils/ui/tailwindcss"

import type {TaskCommentKind} from "@daily/protocol"

const props = defineProps<{kind: TaskCommentKind; provider: string | null}>()

const label = computed(() => (props.kind === "agent" ? "Agent" : (props.provider ?? "MCP")))

function getBadgeClasses(kind: TaskCommentKind) {
  return cn(
    "inline-flex h-4.5 max-w-40 min-w-0 shrink items-center gap-0.5 rounded-full px-1.5 text-[11px] font-semibold",
    kind === "agent" ? "bg-accent/12 text-accent" : "bg-base-content/10 text-base-content/60",
  )
}
</script>

<template>
  <span v-if="kind !== 'manual'" :class="getBadgeClasses(kind)">
    <BaseIcon v-if="kind === 'agent'" name="logo" class="size-3" />
    <AgentIcon v-else :name="provider ?? ''" class="size-3" />

    <span class="min-w-0 truncate">{{ label }}</span>
  </span>
</template>
