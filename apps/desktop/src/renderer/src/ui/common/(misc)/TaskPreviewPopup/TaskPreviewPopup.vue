<script setup lang="ts">
import {useTemplateRef} from "vue"

import {useTaskPreview} from "./composables/useTaskPreview"
import TaskPreview from "./{fragments}/TaskPreview.vue"

const props = defineProps<{id: string; alignment?: HTMLElement | null; placement?: "left" | "top-end"}>()

const previewRef = useTemplateRef("preview")

const {previewTask, isPreviewVisible, floatingStyles, showPreview, leavePreview, holdPreview, scheduleHide, hidePreview} = useTaskPreview(
  previewRef,
  () => props.alignment ?? null,
  () => props.placement ?? "left",
)
</script>

<template>
  <slot :task-id="isPreviewVisible ? (previewTask?.id ?? null) : null" :show="showPreview" :leave="leavePreview" :hide="hidePreview" />

  <Teleport to="body">
    <div
      v-if="previewTask"
      :id="id"
      ref="preview"
      role="tooltip"
      class="dock-surface z-[998] max-h-[min(592px,calc(100dvh-16px))] w-[336px] max-w-[calc(100vw-16px)] overflow-auto overscroll-contain rounded-2xl shadow-lg"
      :style="[floatingStyles, {visibility: isPreviewVisible ? 'visible' : 'hidden'}]"
      @pointerenter="holdPreview"
      @pointerleave="scheduleHide"
    >
      <TaskPreview :key="previewTask.id" :task="previewTask" />
    </div>
  </Teleport>
</template>
