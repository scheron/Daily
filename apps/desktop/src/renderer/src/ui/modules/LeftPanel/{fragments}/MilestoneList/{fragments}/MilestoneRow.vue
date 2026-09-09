<script setup lang="ts">
import {computed} from "vue"
import {toasts} from "vue-toasts-lite"

import {toDateLabel} from "@daily/std"

import {useMilestonesStore} from "@/stores/milestones.store"
import BaseButton from "@/ui/base/BaseButton"
import BasePopup from "@/ui/base/BasePopup.vue"
import DonutChart from "@/ui/common/charts/DonutChart.vue"
import {ConfirmPopup} from "@/ui/overlays/ConfirmPopup"
import MilestoneForm from "./MilestoneForm.vue"

import type {MilestoneWithProgress} from "@daily/protocol"

const props = defineProps<{milestone: MilestoneWithProgress}>()

const milestonesStore = useMilestonesStore()

const isSelected = computed(() => milestonesStore.selectedMilestoneId === props.milestone.id)
const dateLabel = computed(() => (props.milestone.date ? toDateLabel(props.milestone.date, {short: true, year: false}) : null))
const segments = computed(() => [
  {value: props.milestone.progress.done, color: "var(--color-accent)"},
  {value: props.milestone.progress.total - props.milestone.progress.done},
])

function select() {
  milestonesStore.selectMilestone(props.milestone.id)
}

async function onDelete() {
  const deleted = await milestonesStore.deleteMilestone(props.milestone.id)
  if (!deleted) {
    toasts.error("Failed to delete milestone")
    return
  }

  toasts.success("Milestone deleted")
}
</script>

<template>
  <div
    class="group flex w-full cursor-pointer items-center gap-2.5 rounded-lg border border-transparent px-2 py-1.5 transition-colors"
    :class="isSelected ? 'bg-accent/15 border-accent/35' : 'hover:bg-base-200'"
    @click="select"
  >
    <DonutChart :segments="segments" :size="30" :thickness="4">
      <span class="text-[9px] font-semibold" :class="isSelected ? 'text-accent' : 'text-base-content/70'">{{ milestone.progress.percent }}%</span>
    </DonutChart>

    <div class="flex min-w-0 flex-1 flex-col gap-0.5">
      <span class="truncate text-xs font-medium" :class="isSelected ? 'text-accent' : 'text-base-content/85'">{{ milestone.name }}</span>
      <span class="text-base-content/55 truncate text-[11px]">
        {{ milestone.progress.done }} / {{ milestone.progress.total }}<template v-if="dateLabel"> · due {{ dateLabel }}</template>
      </span>
    </div>

    <div class="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">
      <BasePopup hide-header position="end" container-class="w-88 p-0">
        <template #trigger="{toggle}">
          <BaseButton icon="pencil" variant="ghost" icon-class="size-3.5" class="size-6 p-0" @click.stop="toggle" />
        </template>
        <template #default="{hide}">
          <MilestoneForm :milestone="milestone" @done="hide" @cancel="hide" />
        </template>
      </BasePopup>

      <ConfirmPopup
        title="Delete milestone?"
        message="Its tasks stay right where they are — they just lose this milestone."
        confirm-text="Delete"
        position="end"
        content-class="max-w-72"
        @confirm="onDelete"
      >
        <template #trigger="{show}">
          <BaseButton icon="trash" variant="ghost" icon-class="size-3.5" class="text-error hover:bg-error/10 size-6 p-0" @click.stop="show" />
        </template>
      </ConfirmPopup>
    </div>
  </div>
</template>
