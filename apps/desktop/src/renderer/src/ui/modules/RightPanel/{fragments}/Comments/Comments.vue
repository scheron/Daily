<script setup lang="ts">
import {computed, nextTick, ref, watch} from "vue"

import {toDateLabel, toISODate} from "@daily/std"

import BaseButton from "@/ui/base/BaseButton"
import BaseIcon from "@/ui/base/BaseIcon"
import {nestedTarget} from "@/ui/modules/RightPanel/composables/useNestedView"
import {useTaskComments} from "@/ui/modules/RightPanel/composables/useTaskComments"
import {useTaskHistory} from "../History/composables/useTaskHistory"
import HistoryEvent from "../History/{fragments}/HistoryEvent.vue"
import CommentItem from "./{fragments}/CommentItem"

import type {TaskComment, TaskEvent} from "@daily/protocol"

type ActivityItem = {key: string; at: string; comment?: TaskComment; event?: TaskEvent}

let commentOpener: HTMLElement | null = null

const isOnlyComments = ref(false)

const {comments, removeComment} = useTaskComments()
const {events} = useTaskHistory()

const items = computed<ActivityItem[]>(() => {
  const all: ActivityItem[] = comments.value.map((comment) => ({key: `c:${comment.id}`, at: comment.createdAt, comment}))
  if (!isOnlyComments.value) all.push(...events.value.map((event) => ({key: `e:${event.id}`, at: event.createdAt, event})))
  return all.sort((a, b) => {
    if (a.at !== b.at) return a.at < b.at ? -1 : 1
    const sequence = (a.event?.sequence ?? 0) - (b.event?.sequence ?? 0)
    if (sequence) return sequence
    return a.key < b.key ? -1 : a.key > b.key ? 1 : 0
  })
})

const days = computed(() => {
  const groups = new Map<string, ActivityItem[]>()
  for (const item of items.value) {
    const day = toISODate(new Date(item.at))
    const group = groups.get(day)
    if (group) group.push(item)
    else groups.set(day, [item])
  }
  return [...groups].map(([day, entries]) => ({day, entries}))
})

function getOnlyCommentsVariant(isSelected: boolean) {
  return isSelected ? "ghost-muted-selected" : "ghost-muted"
}

function openComment(id: TaskComment["id"], event: MouseEvent) {
  commentOpener = event.currentTarget as HTMLElement
  nestedTarget.value = {kind: "comment", id}
}

watch(nestedTarget, async (target, previous) => {
  if (target || previous?.kind !== "comment") return
  await nextTick()
  if (commentOpener?.isConnected) commentOpener.focus({preventScroll: true})
  commentOpener = null
})
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
      <span class="text-base-content/50 text-sm">No activity yet</span>
    </div>

    <div v-else>
      <section v-for="group in days" :key="group.day" :aria-labelledby="`activity-day-${group.day}`" class="mt-6 first:mt-1">
        <h3 :id="`activity-day-${group.day}`" class="text-base-content/70 mb-1.5 px-4 text-[.8rem] font-semibold leading-normal">
          {{ toDateLabel(group.day, {short: true}) }}
        </h3>
        <div class="divide-base-content/10 mx-4 divide-y">
          <template v-for="item in group.entries" :key="item.key">
            <CommentItem
              v-if="item.comment"
              :comment="item.comment"
              @open="openComment(item.comment.id, $event)"
              @remove="removeComment(item.comment.id)"
            />
            <HistoryEvent v-else-if="item.event" :event="item.event" />
          </template>
        </div>
      </section>
    </div>
  </section>
</template>
