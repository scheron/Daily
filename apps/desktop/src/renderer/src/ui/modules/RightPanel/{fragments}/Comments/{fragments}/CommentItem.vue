<script setup lang="ts">
import {toLocaleDateTime, toRelativeTime} from "@daily/std"

import BaseButton from "@/ui/base/BaseButton"
import MarkdownContent from "@/ui/common/misc/MarkdownContent.vue"
import ConfirmPopup from "@/ui/overlays/ConfirmPopup.vue"
import CommentSourceBadge from "./CommentSourceBadge.vue"

import type {TaskComment} from "@daily/protocol"

defineProps<{comment: TaskComment}>()

const emit = defineEmits<{open: []; remove: []}>()
</script>

<template>
  <div class="group px-4 pb-2.5 pt-2">
    <div class="flex h-5 items-center gap-1.5">
      <CommentSourceBadge :kind="comment.kind" :provider="comment.provider" />

      <span v-tooltip="toLocaleDateTime(comment.createdAt)" class="text-base-content/40 text-xs">{{ toRelativeTime(comment.createdAt) }}</span>

      <div class="ml-auto flex gap-0.5 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
        <BaseButton variant="ghost-muted" icon="pencil" size="xs" tooltip="Edit" @click="emit('open')" />

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
            <BaseButton variant="error-ghost" icon="trash" size="xs" tooltip="Delete" @click="show" />
          </template>
        </ConfirmPopup>
      </div>
    </div>

    <MarkdownContent :content="comment.content" :minimizable="false" class="comment-markdown mt-0.5 select-text" />
  </div>
</template>

<style scoped>
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
