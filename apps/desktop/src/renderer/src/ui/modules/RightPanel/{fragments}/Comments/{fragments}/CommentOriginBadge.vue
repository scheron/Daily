<script setup lang="ts">
import BaseIcon from "@/ui/base/BaseIcon"
import {cn} from "@/utils/ui/tailwindcss"

import type {IconName} from "@/ui/base/BaseIcon"
import type {TaskCommentOrigin} from "@daily/protocol"

const ORIGIN_META: Record<TaskCommentOrigin, {icon: IconName; label: string; badgeClass: string}> = {
  mcp: {icon: "tool", label: "MCP", badgeClass: "bg-base-content/10 text-base-content/60"},
  agent: {icon: "sparkles", label: "Agent", badgeClass: "bg-accent/12 text-accent"},
}

const props = defineProps<{origin: TaskCommentOrigin}>()

function getBadgeClasses(badgeClass: string) {
  return cn("inline-flex h-4.5 shrink-0 items-center gap-0.5 rounded-full px-1.5 text-[11px] font-semibold", badgeClass)
}
</script>

<template>
  <span :class="getBadgeClasses(ORIGIN_META[props.origin].badgeClass)">
    <BaseIcon :name="ORIGIN_META[props.origin].icon" class="size-3" />
    {{ ORIGIN_META[props.origin].label }}
  </span>
</template>
