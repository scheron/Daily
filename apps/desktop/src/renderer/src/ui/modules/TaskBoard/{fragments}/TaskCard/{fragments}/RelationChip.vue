<script setup lang="ts">
import {computed} from "vue"

import {useTaskRelationsStore} from "@/stores/taskRelations.store"
import BaseIcon from "@/ui/base/BaseIcon"
import {cn} from "@/utils/ui/tailwindcss"

import type {TaskRelationChip} from "@/stores/taskRelations.store"
import type {IconName} from "@/ui/base/BaseIcon"
import type {Task} from "@daily/protocol"

const props = defineProps<{taskId: Task["id"]}>()

const taskRelationsStore = useTaskRelationsStore()

const chip = computed(() => taskRelationsStore.chipByTaskId.get(props.taskId) ?? null)

function getChipClasses(kind: TaskRelationChip["kind"]) {
  return cn(
    "inline-flex h-6 items-center gap-1 rounded-full px-2 text-xs whitespace-nowrap",
    kind === "blocked-by" ? "bg-warning/15 text-warning" : "bg-base-200 text-base-content/80",
  )
}

function getIconName(kind: TaskRelationChip["kind"]): IconName {
  return ({"blocked-by": "alert-triangle", blocks: "chevrons-down", linked: "link"} satisfies Record<TaskRelationChip["kind"], IconName>)[kind]
}

function getLabel(kind: TaskRelationChip["kind"]) {
  return {"blocked-by": "Blocked by", blocks: "Blocks", linked: "Linked"}[kind]
}
</script>

<template>
  <span v-if="chip" :class="getChipClasses(chip.kind)">
    <BaseIcon :name="getIconName(chip.kind)" class="size-3.5" />
    <span>{{ getLabel(chip.kind) }}</span>
    <span class="font-semibold">{{ chip.count }}</span>
  </span>
</template>
