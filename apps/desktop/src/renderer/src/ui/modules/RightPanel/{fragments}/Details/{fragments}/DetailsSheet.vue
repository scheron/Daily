<script setup lang="ts">
import BaseIcon from "@/ui/base/BaseIcon"
import {useTaskEditor} from "@/ui/modules/RightPanel/composables/useTaskEditor"
import BranchProperty from "./properties/BranchProperty.vue"
import DateProperty from "./properties/DateProperty.vue"
import MilestoneProperty from "./properties/MilestoneProperty.vue"
import TimeProperty from "./properties/TimeProperty.vue"
import RelationsSection from "./sections/RelationsSection"
import TagsSection from "./sections/TagsSection"
import StatusSelector from "./StatusSelector.vue"

import type {Task} from "@daily/protocol"

defineProps<{task: Task}>()

const {closeDetails} = useTaskEditor()
</script>

<template>
  <div class="bg-base-100 border-base-300 absolute inset-x-0 top-0 z-20 flex h-2/3 flex-col rounded-b-2xl border-b shadow-lg">
    <div class="min-h-0 flex-1 overflow-y-auto px-2 pt-2 pb-3">
      <StatusSelector :task="task" />

      <div class="mt-2 grid grid-cols-2 gap-x-2 gap-y-0.5">
        <DateProperty :task="task" />
        <TimeProperty :task="task" />
        <BranchProperty :task="task" />
        <MilestoneProperty :task="task" />
      </div>

      <TagsSection :task="task" />
      <RelationsSection side="blockedBy" />
      <RelationsSection side="blocks" />
    </div>

    <button
      type="button"
      class="border-base-300 focus-visible-accent hover:bg-base-content/5 flex h-11 shrink-0 items-center gap-2.5 border-t px-4 transition-colors"
      @click="closeDetails"
    >
      <BaseIcon name="chevron-up" class="text-base-content/40 size-3.5" />
      <span class="text-base-content/80 text-sm font-medium">Collapse</span>

      <span class="border-base-300 text-base-content/40 ml-auto rounded-md border px-1.5 py-0.5 font-mono text-xs">Esc</span>
    </button>
  </div>
</template>
