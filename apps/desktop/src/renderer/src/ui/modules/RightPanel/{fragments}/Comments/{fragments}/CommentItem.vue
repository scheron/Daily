<script setup lang="ts">
import {ref} from "vue"

import {toRelativeTime} from "@daily/std"

import BaseButton from "@/ui/base/BaseButton"
import MarkdownContent from "@/ui/common/misc/MarkdownContent.vue"
import ConfirmPopup from "@/ui/overlays/ConfirmPopup.vue"
import {toShortcutKeys} from "@/utils/shortcuts/toShortcutKeys"
import {cn} from "@/utils/ui/tailwindcss"
import CommentField from "./CommentField.vue"
import CommentSourceBadge from "./CommentSourceBadge.vue"

import type {TaskComment} from "@daily/protocol"

const props = defineProps<{comment: TaskComment}>()

const emit = defineEmits<{edit: [string]; remove: []}>()

const isEditing = ref(false)
const draft = ref("")

function startEditing() {
  draft.value = props.comment.content
  isEditing.value = true
}

function cancelEditing() {
  isEditing.value = false
  draft.value = ""
}

function submitEditing() {
  const content = draft.value.trim()
  if (content && content !== props.comment.content) emit("edit", content)
  cancelEditing()
}

function getRowClasses(editing: boolean) {
  return cn("group border-base-300/60 border-b px-4 pt-2 pb-2.5", editing && "bg-accent/6")
}
</script>

<template>
  <div :class="getRowClasses(isEditing)">
    <div class="flex h-5 items-center gap-1.5">
      <CommentSourceBadge :kind="comment.kind" :provider="comment.provider" />

      <span class="text-base-content/40 text-xs">{{ toRelativeTime(comment.createdAt) }}</span>

      <div v-if="!isEditing" class="ml-auto flex gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
        <BaseButton variant="ghost-muted" icon="pencil" size="xs" tooltip="Edit" @click="startEditing" />

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

    <CommentField
      v-if="isEditing"
      v-model="draft"
      class="pt-1"
      submit-text="Save"
      :hint-key="toShortcutKeys('comments:cancel')"
      hint-text="to cancel"
      @submit="submitEditing"
      @cancel="cancelEditing"
    />

    <MarkdownContent v-else :content="comment.content" :minimizable="false" class="comment-markdown mt-0.5 select-text" />
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
