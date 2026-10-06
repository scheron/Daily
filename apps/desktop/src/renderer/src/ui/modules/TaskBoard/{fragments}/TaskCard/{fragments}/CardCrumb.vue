<script setup lang="ts">
import {computed} from "vue"

import {isMilestoneOverdue, milestoneCompletion} from "@daily/protocol"
import {getToday} from "@daily/std"

import BaseIcon from "@/ui/base/BaseIcon"
import MilestoneDiamond from "@/ui/common/milestones/MilestoneDiamond.vue"
import {cn} from "@/utils/ui/tailwindcss"

import type {MilestoneWithProgress} from "@/stores/milestones.store"

const props = defineProps<{projectName: string; milestone: MilestoneWithProgress | null}>()

const completion = computed(() => (props.milestone ? milestoneCompletion(props.milestone.progress) : 0))
const overdue = computed(() => (props.milestone ? isMilestoneOverdue(props.milestone, props.milestone.progress, getToday()) : false))

function getMilestoneClasses(isOverdue: boolean) {
  return cn("inline-flex min-w-14 shrink items-center gap-1", isOverdue && "text-error")
}
</script>

<template>
  <div class="text-base-content/55 flex h-4 min-w-0 shrink-0 items-center gap-1 text-xs">
    <span v-if="projectName" class="inline-flex min-w-12 shrink-[1000] items-center gap-1" :title="projectName">
      <BaseIcon name="project" class="size-3.5 shrink-0" />
      <span class="min-w-0 truncate">{{ projectName }}</span>
    </span>
    <BaseIcon v-if="projectName && milestone" name="chevron-right" class="text-base-content/35 size-3.5 shrink-0" />
    <span v-if="milestone" :class="getMilestoneClasses(overdue)" :title="milestone.name">
      <MilestoneDiamond class="shrink-0" :completion="completion" :overdue="overdue" :size="12" />
      <span class="min-w-0 truncate">{{ milestone.name }}</span>
    </span>
  </div>
</template>
