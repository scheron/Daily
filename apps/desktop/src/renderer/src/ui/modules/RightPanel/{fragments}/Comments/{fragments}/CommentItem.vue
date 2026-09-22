<script setup lang="ts">
import {ref} from "vue"

import {toRelativeTime} from "@daily/std"

import BaseButton from "@/ui/base/BaseButton"
import ConfirmPopup from "@/ui/overlays/ConfirmPopup.vue"
import {cn} from "@/utils/ui/tailwindcss"
import CommentField from "./CommentField.vue"
import CommentOriginBadge from "./CommentOriginBadge.vue"

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
  return cn("group border-base-300/60 border-b px-4 pt-2 pb-2.5", editing ? "bg-accent/6" : "hover:bg-base-content/3")
}
</script>

<template>
  <div :class="getRowClasses(isEditing)">
    <div class="flex h-5 items-center gap-1.5">
      <CommentOriginBadge v-if="comment.origin" :origin="comment.origin" />

      <span class="text-base-content/40 text-xs">{{ toRelativeTime(comment.createdAt) }}</span>

      <div v-if="!isEditing" class="ml-auto flex gap-0.5 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
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
      hint-key="esc"
      hint-text="to cancel"
      @submit="submitEditing"
      @cancel="cancelEditing"
    />

    <div v-else class="text-base-content/90 mt-0.5 select-text whitespace-pre-wrap text-sm leading-relaxed">
      {{ comment.content }}
    </div>
  </div>
</template>
