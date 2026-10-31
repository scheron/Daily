<script setup lang="ts">
import {useTemplateRef} from "vue"

import {toLocaleDateTime, toTime} from "@daily/std"

import BaseButton from "@/ui/base/BaseButton"
import ConfirmPopup from "@/ui/overlays/ConfirmPopup.vue"
import CommentPreview from "./{fragments}/CommentPreview.vue"
import CommentSourceBadge from "./{fragments}/CommentSourceBadge.vue"

import type {TaskComment} from "@daily/protocol"

defineProps<{comment: TaskComment}>()

const emit = defineEmits<{open: [event: MouseEvent]; remove: []}>()

const rowRef = useTemplateRef<HTMLDivElement>("row")

function focusClippedContent() {
  rowRef.value?.focus({preventScroll: true})
}

function focusRow(event: MouseEvent) {
  const target = event.target as HTMLElement
  if (!target.closest("button, a, [role=img]")) (event.currentTarget as HTMLElement).focus({preventScroll: true})
}
</script>

<template>
  <div ref="row" class="comment-row group relative py-2.5" :data-time="toTime(comment.createdAt)" tabindex="0" @click="focusRow">
    <div class="grid grid-cols-[20px_minmax(0,1fr)] items-start gap-2.5">
      <CommentSourceBadge :kind="comment.kind" :provider="comment.provider" />
      <CommentPreview :content="comment.content" class="comment-markdown min-w-0 select-text" @clip-focus="focusClippedContent" />
    </div>
    <time :datetime="comment.createdAt" class="sr-only">{{ toLocaleDateTime(comment.createdAt) }}</time>

    <div class="comment-actions">
      <ConfirmPopup
        title="Delete comment?"
        message="This comment will be removed."
        confirm-text="Delete"
        cancel-text="Cancel"
        position="end"
        content-class="max-w-64"
        @confirm="emit('remove')"
      >
        <template #trigger="{show}">
          <BaseButton variant="error-ghost" icon="trash" size="xs" tooltip="Delete" aria-label="Delete comment" @click="show" />
        </template>
      </ConfirmPopup>
      <BaseButton
        variant="primary-ghost"
        icon="chevron-right"
        size="xs"
        tooltip="Open comment"
        aria-label="Open comment"
        @click="emit('open', $event)"
      />
    </div>
  </div>
</template>

<style scoped>
.comment-row {
  --action-bar-top: 0.125rem;
  --action-bar-height: calc(2rem + 2px);
}

.comment-row:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 2px;
  border-radius: 0.25rem;
}

.comment-actions {
  position: absolute;
  top: var(--action-bar-top);
  right: 0;
  z-index: 3;
  display: flex;
  height: var(--action-bar-height);
  gap: 0.125rem;
  padding: 0.25rem;
  border: 1px solid color-mix(in oklab, var(--color-base-content) 10%, transparent);
  border-radius: 999px;
  background: var(--color-base-100);
  box-shadow: 0 2px 4px rgb(0 0 0 / 8%);
  opacity: 0;
  pointer-events: none;
}

.comment-row::after {
  content: attr(data-time);
  position: absolute;
  top: calc(var(--action-bar-top) + var(--action-bar-height) / 2);
  right: 4.75rem;
  z-index: 4;
  transform: translateY(-50%);
  padding: 0.25rem 0.5rem;
  border-radius: 0.25rem;
  background: var(--color-base-content);
  color: var(--color-base-100);
  font-size: 0.75rem;
  line-height: 1.25;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
  opacity: 0;
  visibility: hidden;
  pointer-events: none;
}

.comment-row:hover .comment-actions,
.comment-row:focus-within .comment-actions {
  opacity: 1;
  pointer-events: auto;
}

.comment-row:hover::after,
.comment-row:focus-within::after {
  opacity: 1;
  visibility: visible;
}

.comment-markdown :deep(> :first-child) {
  margin-top: 0;
}

.comment-markdown :deep(.cm-heading) {
  margin-top: 0.25rem;
  margin-bottom: 0.1rem;
}

.comment-markdown :deep(.cm-heading1),
.comment-markdown :deep(.cm-heading2) {
  font-size: 1.15em !important;
  margin: 0.25rem 0 0.1rem !important;
  padding-bottom: 0 !important;
}
</style>
