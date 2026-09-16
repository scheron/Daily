<script setup lang="ts">
import BranchProperty from "./properties/BranchProperty.vue"
import DateProperty from "./properties/DateProperty.vue"
import MilestoneProperty from "./properties/MilestoneProperty.vue"
import TimeProperty from "./properties/TimeProperty.vue"
import RelationsSection from "./sections/RelationsSection"
import TagsSection from "./sections/TagsSection"
import StatusSelector from "./StatusSelector.vue"

import type {Task} from "@daily/protocol"

defineProps<{task: Task}>()
</script>

<template>
  <div class="bg-base-100 border-base-300 absolute inset-x-0 top-0 z-20 flex max-h-2/3 flex-col rounded-b-2xl border-b shadow-lg">
    <div class="min-h-0 overflow-y-auto px-2 pt-2 pb-3">
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
  </div>
</template>
