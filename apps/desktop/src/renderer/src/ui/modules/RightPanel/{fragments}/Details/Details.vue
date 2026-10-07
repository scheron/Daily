<script setup lang="ts">
import BranchProperty from "./{fragments}/properties/BranchProperty.vue"
import DateProperty from "./{fragments}/properties/DateProperty.vue"
import MilestoneProperty from "./{fragments}/properties/MilestoneProperty.vue"
import PriorityProperty from "./{fragments}/properties/PriorityProperty.vue"
import RelationsProperty from "./{fragments}/properties/RelationsProperty.vue"
import TagsProperty from "./{fragments}/properties/TagsProperty.vue"
import TimeProperty from "./{fragments}/properties/TimeProperty.vue"
import StatusSelector from "./{fragments}/StatusSelector.vue"

import type {Task} from "@daily/protocol"

defineProps<{task: Task}>()
</script>

<template>
  <div class="border-base-300 shrink-0 border-b px-2 pt-2 pb-3">
    <StatusSelector :task="task" />

    <div class="mt-2 grid grid-cols-6 gap-x-2 gap-y-0.5">
      <div class="col-span-3 min-w-0">
        <DateProperty :task="task" />
      </div>
      <div class="col-span-3 min-w-0">
        <TimeProperty :task="task" />
      </div>
      <div class="col-span-2 min-w-0">
        <BranchProperty :task="task" />
      </div>
      <div class="col-span-2 min-w-0">
        <MilestoneProperty :task="task" />
      </div>
      <div class="col-span-2 min-w-0">
        <PriorityProperty :task="task" />
      </div>
    </div>

    <TagsProperty :task="task" />
    <RelationsProperty side="blockedBy" />
    <RelationsProperty side="blocks" />
  </div>
</template>
