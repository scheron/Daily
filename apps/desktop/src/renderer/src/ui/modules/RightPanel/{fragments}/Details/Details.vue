<script setup lang="ts">
import {useId, useTemplateRef} from "vue"

import TaskPreviewPopup from "@/ui/common/(misc)/TaskPreviewPopup"
import BranchProperty from "./{fragments}/(properties)/BranchProperty.vue"
import DateProperty from "./{fragments}/(properties)/DateProperty.vue"
import MilestoneProperty from "./{fragments}/(properties)/MilestoneProperty.vue"
import PriorityProperty from "./{fragments}/(properties)/PriorityProperty.vue"
import RelationsProperty from "./{fragments}/(properties)/RelationsProperty.vue"
import StatusProperty from "./{fragments}/(properties)/StatusProperty.vue"
import TagsProperty from "./{fragments}/(properties)/TagsProperty.vue"
import TimeProperty from "./{fragments}/(properties)/TimeProperty.vue"

import type {Task, TaskRelationSets} from "@daily/protocol"

const RELATION_SIDES: (keyof TaskRelationSets)[] = ["blockedBy", "blocks"]

defineProps<{task: Task}>()

const detailsRef = useTemplateRef("details")

const previewId = useId()
</script>

<template>
  <div ref="details" class="shrink-0 px-2 pb-3 pt-2">
    <div class="grid grid-cols-3 gap-x-2 gap-y-0.5">
      <div class="min-w-0">
        <StatusProperty :task="task" />
      </div>
      <div class="min-w-0">
        <DateProperty :task="task" />
      </div>
      <div class="min-w-0">
        <TimeProperty :task="task" />
      </div>
      <div class="min-w-0">
        <BranchProperty :task="task" />
      </div>
      <div class="min-w-0">
        <MilestoneProperty :task="task" />
      </div>
      <div class="min-w-0">
        <PriorityProperty :task="task" />
      </div>
    </div>

    <TagsProperty :task="task" />
    <TaskPreviewPopup :id="previewId" :key="task.id" :alignment="detailsRef" v-slot="{taskId, show, leave, hide}">
      <RelationsProperty
        v-for="side in RELATION_SIDES"
        :key="side"
        :side="side"
        :preview-id="previewId"
        :preview-task-id="taskId"
        @preview="show"
        @leave-preview="leave"
        @hide-preview="hide"
      />
    </TaskPreviewPopup>
  </div>
</template>
