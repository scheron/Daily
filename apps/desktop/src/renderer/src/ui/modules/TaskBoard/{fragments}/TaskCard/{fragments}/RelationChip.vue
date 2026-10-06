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
  return cn("inline-flex items-center gap-1 text-xs whitespace-nowrap", kind === "blocked-by" ? "text-warning" : "text-base-content/75")
}

function getIconName(kind: TaskRelationChip["kind"]): IconName {
  return ({"blocked-by": "alert-triangle", blocks: "ban", linked: "link"} satisfies Record<TaskRelationChip["kind"], IconName>)[kind]
}

function getLabel(chip: TaskRelationChip) {
  return `${{"blocked-by": "Blocked by", blocks: "Blocks", linked: "Linked"}[chip.kind]} ${chip.count}`
}
</script>

<template>
  <span v-if="chip" v-tooltip="getLabel(chip)" :class="getChipClasses(chip.kind)">
    <BaseIcon :name="getIconName(chip.kind)" class="size-3.5" />
    <span class="font-semibold">{{ chip.count }}</span>
  </span>
</template>
