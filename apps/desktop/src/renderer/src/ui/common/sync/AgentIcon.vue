<script setup lang="ts">
import {computed} from "vue"

import BaseIcon from "@/ui/base/BaseIcon"

import type {IconName} from "@/ui/base/BaseIcon"

const props = defineProps<{name: string}>()

const iconName = computed(() => toIconName(props.name))

function toIconName(agentName: string): IconName {
  switch (agentName.trim().toLowerCase()) {
    case "claude code":
      return "claude-code"
    case "claude":
      return "claude"
    case "chatgpt":
      return "openai"
    case "codex":
      return "codex"
    default:
      return "ai"
  }
}
</script>

<template>
  <BaseIcon :name="iconName" />
</template>
