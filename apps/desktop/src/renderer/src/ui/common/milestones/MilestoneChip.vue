<script setup lang="ts">
import {computed} from "vue"

import {isMilestoneOverdue, milestoneCompletion} from "@daily/protocol"
import {getToday} from "@daily/std"

import MilestoneDiamond from "./MilestoneDiamond.vue"

import type {MilestoneView} from "@daily/protocol"

const props = withDefaults(defineProps<{milestone: MilestoneView; size?: number}>(), {size: 12})

const completion = computed(() => milestoneCompletion(props.milestone.progress))
const overdue = computed(() => isMilestoneOverdue(props.milestone, props.milestone.progress, getToday()))
</script>

<template>
  <span class="ms-chip inline-flex min-w-0 items-center gap-1.5 rounded-full py-1 pr-2.5 pl-2 text-xs font-medium" :class="{overdue}">
    <MilestoneDiamond :completion="completion" :overdue="overdue" :size="size" />
    <span class="min-w-0 truncate">{{ milestone.name }}</span>
  </span>
</template>

<style scoped>
.ms-chip {
  --mc: var(--color-accent);

  color: color-mix(in oklab, var(--mc) 70%, var(--color-base-content));
  background: color-mix(in oklab, var(--mc) 12%, transparent);
  border: 1px solid color-mix(in oklab, var(--mc) 28%, transparent);
}

.ms-chip.overdue {
  --mc: var(--color-error);
  font-weight: 600;
}
</style>
