<script setup lang="ts">
import BranchProperty from "./{fragments}/properties/BranchProperty.vue"
import DateProperty from "./{fragments}/properties/DateProperty.vue"
import MilestoneProperty from "./{fragments}/properties/MilestoneProperty.vue"
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

    <div class="mt-2 grid grid-cols-2 gap-x-2 gap-y-0.5">
      <DateProperty :task="task" />
      <TimeProperty :task="task" />
      <BranchProperty :task="task" />
      <MilestoneProperty :task="task" />
    </div>

    <TagsProperty :task="task" />
    <RelationsProperty side="blockedBy" />
    <RelationsProperty side="blocks" />
  </div>
</template>
