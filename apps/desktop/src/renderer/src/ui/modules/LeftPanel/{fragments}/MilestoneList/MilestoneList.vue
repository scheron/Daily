<script setup lang="ts">
import {onMounted} from "vue"

import {useMilestonesStore} from "@/stores/milestones.store"
import BaseButton from "@/ui/base/BaseButton"
import BaseIcon from "@/ui/base/BaseIcon"
import BasePopup from "@/ui/base/BasePopup.vue"
import MilestoneForm from "./{fragments}/MilestoneForm.vue"
import MilestoneRow from "./{fragments}/MilestoneRow.vue"

const milestonesStore = useMilestonesStore()

onMounted(() => {
  milestonesStore.getMilestoneList()
})
</script>

<template>
  <div class="flex flex-col p-1">
    <div class="h-panel-header mb-3 flex items-center gap-2 px-2">
      <BaseIcon name="bookmark" class="text-base-content/60 size-4" />
      <span class="text-base-content/60 text-sm font-medium uppercase tracking-wide">Milestones</span>
      <span class="bg-base-content/10 text-base-content/60 shrink-0 rounded-full px-2 py-0.5 text-xs font-medium">
        {{ milestonesStore.milestones.length }}
      </span>

      <BasePopup hide-header position="end" trigger-class="ml-auto" container-class="w-88 max-h-[580px] p-0">
        <template #trigger="{toggle}">
          <BaseButton
            icon="plus"
            variant="ghost-primary"
            icon-class="size-3.5"
            class="text-accent size-7 shrink-0 p-0"
            tooltip="New milestone"
            @click="toggle"
          />
        </template>
        <template #default="{hide}">
          <MilestoneForm @done="hide" @cancel="hide" />
        </template>
      </BasePopup>
    </div>

    <div v-if="milestonesStore.milestones.length === 0" class="flex flex-1 flex-col items-center justify-center gap-2 px-4 py-6 text-center">
      <BaseIcon name="bookmark" class="text-base-content/25 size-7" />
      <p class="text-base-content/60 text-xs leading-relaxed">No milestones in this project yet.</p>

      <BasePopup hide-header position="center" container-class="w-88 max-h-[580px] p-0">
        <template #trigger="{toggle}">
          <BaseButton variant="primary-ghost-outline" size="sm" icon="plus" icon-class="size-3.5" @click="toggle"> New milestone </BaseButton>
        </template>
        <template #default="{hide}">
          <MilestoneForm @done="hide" @cancel="hide" />
        </template>
      </BasePopup>
    </div>

    <div v-else class="flex max-h-72 flex-col gap-0.5 overflow-y-auto">
      <MilestoneRow v-for="milestone in milestonesStore.milestones" :key="milestone.id" :milestone="milestone" />
    </div>
  </div>
</template>
