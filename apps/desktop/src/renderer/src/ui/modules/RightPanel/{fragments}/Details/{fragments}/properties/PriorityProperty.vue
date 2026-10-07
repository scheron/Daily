<script setup lang="ts">
import {computed} from "vue"

import {useTaskEditorStore} from "@/stores/task-editor"
import BasePopup from "@/ui/base/BasePopup.vue"
import PriorityCombobox from "@/ui/common/comboboxes/PriorityCombobox.vue"
import PriorityIcon from "@/ui/common/priority/PriorityIcon.vue"
import {getPriorityLevel} from "@/utils/priority/getPriorityLevel"
import PropertyCell from "../PropertyCell.vue"

import type {Task, TaskPriority} from "@daily/protocol"

const props = defineProps<{task: Task}>()

const taskEditorStore = useTaskEditorStore()

const label = computed(() => getPriorityLevel(props.task.priority).label)

function onSelect(priority: TaskPriority) {
  taskEditorStore.patch({priority})
}
</script>

<template>
  <BasePopup hide-header position="start">
    <template #trigger="{toggle}">
      <PropertyCell :label="label" :is-empty="task.priority === 'none'" @click="toggle">
        <template #icon>
          <PriorityIcon :priority="task.priority" class="size-4" />
        </template>
      </PropertyCell>
    </template>

    <template #default="{hide}">
      <PriorityCombobox :priority="task.priority" @update="onSelect" @close="hide" />
    </template>
  </BasePopup>
</template>
