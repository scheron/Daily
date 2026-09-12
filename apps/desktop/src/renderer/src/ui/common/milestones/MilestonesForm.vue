<script setup lang="ts">
import {computed, ref, watch} from "vue"
import {toasts} from "vue-toasts-lite"
import VueDraggable from "vuedraggable"

import {getOrderIndexBetween, isMilestoneClosed, normalizeTaskOrderIndexes, sortMilestones} from "@daily/protocol"
import {deepClone} from "@daily/std"

import {useMilestonesStore} from "@/stores/milestones.store"
import {useTasksStore} from "@/stores/tasks"
import BaseInput from "@/ui/base/BaseInput.vue"
import MilestoneRow from "./{fragments}/MilestoneRow.vue"

import type {Branch, Milestone, MilestoneView} from "@daily/protocol"

const props = defineProps<{branchId: Branch["id"]}>()

const milestonesStore = useMilestonesStore()
const tasksStore = useTasksStore()

const newMilestoneName = ref("")
const expandedIds = ref<Set<Milestone["id"]>>(new Set())
const isDragging = ref(false)
const draggableMilestones = ref<MilestoneView[]>([])

const sortedMilestones = computed(() => sortMilestones(milestonesStore.milestonesForBranch(props.branchId)))
const firstClosedIndex = computed(() => sortedMilestones.value.findIndex((milestone) => isMilestoneClosed(milestone.progress)))
const openMilestones = computed(() =>
  firstClosedIndex.value === -1 ? sortedMilestones.value : sortedMilestones.value.slice(0, firstClosedIndex.value),
)
const closedMilestones = computed(() => (firstClosedIndex.value === -1 ? [] : sortedMilestones.value.slice(firstClosedIndex.value)))

watch(
  openMilestones,
  (next) => {
    if (isDragging.value) return
    draggableMilestones.value = next.map((milestone) => deepClone(milestone))
  },
  {immediate: true},
)

function isExpanded(id: Milestone["id"]) {
  return expandedIds.value.has(id)
}

function toggleExpanded(id: Milestone["id"]) {
  const next = new Set(expandedIds.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  expandedIds.value = next
}

function onNameKeydown(event: KeyboardEvent) {
  if (event.key === "Enter") createMilestone()
}

async function createMilestone() {
  const name = newMilestoneName.value.trim()
  if (!name) return

  const created = await milestonesStore.createMilestone(name, null, props.branchId)
  if (!created) {
    toasts.error("Failed to create milestone")
    return
  }

  newMilestoneName.value = ""
  toasts.success("Milestone created")
}

async function deleteMilestone(milestone: MilestoneView) {
  const deleted = await milestonesStore.deleteMilestone(milestone.id)
  if (!deleted) {
    toasts.error("Failed to delete milestone")
    return
  }

  await tasksStore.revalidate()
  toasts.success("Milestone deleted")
}

function onDragStart() {
  isDragging.value = true
}

async function onDragChange(event: {moved?: {oldIndex: number; newIndex: number}}) {
  const moved = event.moved
  if (!moved || moved.newIndex === moved.oldIndex) return

  const list = draggableMilestones.value
  const movedMilestone = list[moved.newIndex]
  if (!movedMilestone) return

  const prevMilestone = list[moved.newIndex - 1] ?? null
  const nextMilestone = list[moved.newIndex + 1] ?? null
  const nextOrderIndex = getOrderIndexBetween(prevMilestone?.orderIndex ?? null, nextMilestone?.orderIndex ?? null)

  if (nextOrderIndex !== null) {
    await milestonesStore.updateMilestone(movedMilestone.id, {orderIndex: nextOrderIndex})
    return
  }

  const normalized = normalizeTaskOrderIndexes(list)
  for (const patch of normalized) {
    const existing = list.find((milestone) => milestone.id === patch.id)
    if (existing && existing.orderIndex !== patch.orderIndex) {
      await milestonesStore.updateMilestone(patch.id, {orderIndex: patch.orderIndex})
    }
  }
}

function onDragEnd() {
  isDragging.value = false
}
</script>

<template>
  <div class="flex flex-col gap-1">
    <div class="border-base-300 focus-within:border-accent group flex h-8 items-center gap-2 rounded-md border border-dashed px-2 transition-colors">
      <BaseInput v-model="newMilestoneName" bare hide-outline placeholder="New milestone" class="h-full flex-1 text-xs" @keydown="onNameKeydown" />

      <button
        type="button"
        :disabled="!newMilestoneName.trim()"
        class="text-base-content/50 border-base-300 hover:text-base-content hover:border-base-content/30 disabled:hover:text-base-content/50 disabled:hover:border-base-300 shrink-0 rounded border px-1.5 text-[11px] leading-5 transition-colors disabled:opacity-40"
        @click="createMilestone"
      >
        ↵
      </button>
    </div>

    <p v-if="!sortedMilestones.length" class="text-base-content/40 px-2 py-3 text-xs">No milestones yet</p>

    <VueDraggable
      v-else
      :list="draggableMilestones"
      item-key="id"
      handle=".ms-drag-handle"
      ghost-class="ms-row-ghost"
      :animation="140"
      @start="onDragStart"
      @change="onDragChange"
      @end="onDragEnd"
    >
      <template #item="{element: milestone}">
        <MilestoneRow
          :milestone="milestone"
          :expanded="isExpanded(milestone.id)"
          @toggle="toggleExpanded(milestone.id)"
          @delete="deleteMilestone(milestone)"
        />
      </template>
    </VueDraggable>

    <template v-if="closedMilestones.length">
      <div class="text-base-content/45 px-2 pt-3 pb-1 text-[11px] font-semibold tracking-wide uppercase">Closed · {{ closedMilestones.length }}</div>
      <MilestoneRow
        v-for="milestone in closedMilestones"
        :key="milestone.id"
        :milestone="milestone"
        :expanded="isExpanded(milestone.id)"
        @toggle="toggleExpanded(milestone.id)"
        @delete="deleteMilestone(milestone)"
      />
    </template>
  </div>
</template>

<style scoped>
.ms-row-ghost {
  opacity: 0.4;
}
</style>
