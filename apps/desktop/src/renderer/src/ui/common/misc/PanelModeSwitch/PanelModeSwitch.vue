<script setup lang="ts">
import {useMilestonesStore} from "@/stores/milestones.store"
import BaseIcon from "@/ui/base/BaseIcon"

import type {BoardMode} from "@/stores/milestones.store"
import type {IconName} from "@/ui/base/BaseIcon"

const MODES: {value: BoardMode; icon: IconName; label: string}[] = [
  {value: "day", icon: "calendar", label: "Day"},
  {value: "milestone", icon: "bookmark", label: "Milestones"},
]

const milestonesStore = useMilestonesStore()
</script>

<template>
  <div class="bg-base-300 inline-flex items-center gap-0.5 rounded-md p-0.5">
    <button
      v-for="opt in MODES"
      :key="opt.value"
      v-tooltip="{content: opt.label}"
      type="button"
      :aria-label="opt.label"
      class="focus-visible-accent flex size-6 cursor-pointer items-center justify-center rounded outline-none transition-colors"
      :class="milestonesStore.mode === opt.value ? 'bg-accent text-base-100' : 'text-base-content/60 hover:text-base-content'"
      @click="milestonesStore.setMode(opt.value)"
    >
      <BaseIcon :name="opt.icon" class="size-3.5" />
    </button>
  </div>
</template>
