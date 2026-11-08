<script setup lang="ts">
import {useId, useTemplateRef, watch} from "vue"

import {useTaskRelationPreview} from "./composables/useTaskRelationPreview"
import BranchProperty from "./{fragments}/properties/BranchProperty.vue"
import DateProperty from "./{fragments}/properties/DateProperty.vue"
import MilestoneProperty from "./{fragments}/properties/MilestoneProperty.vue"
import PriorityProperty from "./{fragments}/properties/PriorityProperty.vue"
import RelationsProperty from "./{fragments}/properties/RelationsProperty.vue"
import StatusProperty from "./{fragments}/properties/StatusProperty.vue"
import TagsProperty from "./{fragments}/properties/TagsProperty.vue"
import TimeProperty from "./{fragments}/properties/TimeProperty.vue"
import TaskRelationPreview from "./{fragments}/TaskRelationPreview.vue"

import type {Task} from "@daily/protocol"

const props = defineProps<{task: Task}>()

const previewId = useId()
const detailsRef = useTemplateRef("details")
const previewRef = useTemplateRef("preview")

const {previewTask, isPreviewVisible, floatingStyles, showPreview, leavePreview, holdPreview, scheduleHide, hidePreview} = useTaskRelationPreview(
  detailsRef,
  previewRef,
)

watch(() => props.task.id, hidePreview)
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
    <RelationsProperty
      v-for="side in ['blockedBy', 'blocks'] as const"
      :key="side"
      :side="side"
      :preview-id="previewId"
      :preview-task-id="isPreviewVisible ? previewTask?.id : undefined"
      @preview="showPreview"
      @leave-preview="leavePreview"
      @hide-preview="hidePreview"
    />
  </div>

  <Teleport to="body">
    <div
      v-if="previewTask"
      :id="previewId"
      ref="preview"
      role="tooltip"
      class="dock-surface z-[998] max-h-[calc(100dvh-16px)] w-[336px] max-w-[calc(100vw-16px)] overflow-auto overscroll-contain rounded-2xl shadow-lg"
      :style="[floatingStyles, {visibility: isPreviewVisible ? 'visible' : 'hidden'}]"
      @pointerenter="holdPreview"
      @pointerleave="scheduleHide"
    >
      <TaskRelationPreview :key="previewTask.id" :task="previewTask" />
    </div>
  </Teleport>
</template>
