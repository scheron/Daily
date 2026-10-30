<script setup lang="ts">
import {computed, ref} from "vue"

import BaseButton from "@/ui/base/BaseButton"
import BaseIcon from "@/ui/base/BaseIcon"
import {nestedTarget} from "@/ui/modules/RightPanel/composables/useNestedView"
import {useTaskComments} from "@/ui/modules/RightPanel/composables/useTaskComments"
import {useTaskHistory} from "../History/composables/useTaskHistory"
import HistoryEvent from "../History/{fragments}/HistoryEvent.vue"
import CommentItem from "./{fragments}/CommentItem.vue"

import type {TaskComment, TaskEvent} from "@daily/protocol"

type ActivityItem = {key: string; at: string; comment?: TaskComment; event?: TaskEvent}

const isOnlyComments = ref(false)

const {comments, removeComment} = useTaskComments()
const {events} = useTaskHistory()

const items = computed<ActivityItem[]>(() => {
  const all: ActivityItem[] = comments.value.map((comment) => ({key: `c:${comment.id}`, at: comment.createdAt, comment}))
  if (!isOnlyComments.value) all.push(...events.value.map((event) => ({key: `e:${event.id}`, at: event.createdAt, event})))
  return all.sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0))
})

function getOnlyCommentsVariant(isSelected: boolean) {
  return isSelected ? "ghost-muted-selected" : "ghost-muted"
}

function openComment(id: TaskComment["id"]) {
  nestedTarget.value = {kind: "comment", id}
}
</script>

<template>
  <section class="flex flex-col">
    <div class="flex min-h-8 items-center gap-1.5 px-4 text-sm font-semibold">
      <BaseIcon name="message" class="size-4" />
      <span>Activity</span>
      <div aria-hidden="true" class="flex-1" />
      <BaseButton
        :variant="getOnlyCommentsVariant(isOnlyComments)"
        icon="message"
        size="xs"
        :aria-pressed="isOnlyComments"
        :tooltip="isOnlyComments ? 'Show all activity' : 'Only comments'"
        @click="isOnlyComments = !isOnlyComments"
      />
    </div>

    <div v-if="!items.length" class="flex flex-col items-center justify-center gap-2 p-4 text-center">
      <BaseIcon name="message" class="text-base-content/15 size-7" />
      <span class="text-base-content/50 text-sm">No comments yet</span>
      <span class="text-base-content/40 max-w-60 text-xs leading-snug">Notes from you, from MCP and from the agent land here.</span>
    </div>

    <div v-else class="pt-2">
      <template v-for="item in items" :key="item.key">
        <CommentItem v-if="item.comment" :comment="item.comment" @open="openComment(item.comment.id)" @remove="removeComment(item.comment.id)" />
        <HistoryEvent v-else-if="item.event" :event="item.event" />
      </template>
    </div>
  </section>
</template>
