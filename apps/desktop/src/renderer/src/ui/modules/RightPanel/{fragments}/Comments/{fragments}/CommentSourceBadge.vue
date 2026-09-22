<script setup lang="ts">
import {computed} from "vue"

import BaseIcon from "@/ui/base/BaseIcon"
import {cn} from "@/utils/ui/tailwindcss"

import type {IconName} from "@/ui/base/BaseIcon"
import type {TaskCommentKind} from "@daily/protocol"

const props = defineProps<{kind: TaskCommentKind; provider: string | null}>()

const badge = computed<{icon: IconName; label: string} | null>(() => {
  if (props.kind === "agent") return {icon: "sparkles", label: "Agent"}
  if (props.kind !== "mcp") return null

  return {icon: "tool", label: props.provider ?? "MCP"}
})

function getBadgeClasses(kind: TaskCommentKind) {
  return cn(
    "inline-flex h-4.5 max-w-40 min-w-0 shrink items-center gap-0.5 rounded-full px-1.5 text-[11px] font-semibold",
    kind === "agent" ? "bg-accent/12 text-accent" : "bg-base-content/10 text-base-content/60",
  )
}
</script>

<template>
  <span v-if="badge" :class="getBadgeClasses(props.kind)">
    <BaseIcon :name="badge.icon" class="size-3" />
    <span class="min-w-0 truncate">{{ badge.label }}</span>
  </span>
</template>
