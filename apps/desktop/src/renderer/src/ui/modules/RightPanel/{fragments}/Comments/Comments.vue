<script setup lang="ts">
import BaseIcon from "@/ui/base/BaseIcon"
import {useTaskComments} from "@/ui/modules/RightPanel/composables/useTaskComments"
import CommentComposer from "./{fragments}/CommentComposer.vue"
import CommentItem from "./{fragments}/CommentItem.vue"

const {comments, addComment, editComment, removeComment} = useTaskComments()
</script>

<template>
  <div class="flex min-h-0 flex-1 flex-col">
    <div v-if="!comments.length" class="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 p-4 text-center">
      <BaseIcon name="message" class="text-base-content/15 size-7" />
      <span class="text-base-content/50 text-sm">No comments yet</span>
      <span class="text-base-content/40 max-w-60 text-xs leading-snug">Notes from you, from MCP and from the agent land here.</span>
    </div>

    <div v-else class="min-h-0 flex-1 overflow-y-auto">
      <CommentItem
        v-for="comment in comments"
        :key="comment.id"
        :comment="comment"
        @edit="editComment(comment.id, $event)"
        @remove="removeComment(comment.id)"
      />
    </div>

    <CommentComposer @submit="addComment" />
  </div>
</template>
