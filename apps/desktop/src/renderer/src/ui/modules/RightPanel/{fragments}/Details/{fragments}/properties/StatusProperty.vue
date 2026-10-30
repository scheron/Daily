<script setup lang="ts">
import {computed} from "vue"

import {boardColumnForStatus} from "@daily/protocol"

import {TASK_COLUMNS} from "@/constants/ui"
import {useSettingsStore} from "@/stores/settings.store"
import {useTaskEditorStore} from "@/stores/task-editor"
import BaseIcon from "@/ui/base/BaseIcon"
import BasePopup from "@/ui/base/BasePopup.vue"
import StatusCombobox from "@/ui/common/comboboxes/StatusCombobox.vue"
import PropertyCell from "../PropertyCell.vue"

import type {Task, TaskStatus} from "@daily/protocol"

const props = defineProps<{task: Task}>()

const taskEditorStore = useTaskEditorStore()
const settingsStore = useSettingsStore()

const boardMode = computed(() => settingsStore.settings?.appearance?.boardMode ?? "normal")
const options = computed(() => TASK_COLUMNS.filter((option) => boardColumnForStatus(option.status, boardMode.value) === option.status))
const activeStatus = computed(() => boardColumnForStatus(props.task.status, boardMode.value))
const active = computed(() => options.value.find((option) => option.status === activeStatus.value) ?? options.value[0])

function selectStatus(status: TaskStatus) {
  if (status !== props.task.status) taskEditorStore.patch({status})
}
</script>

<template>
  <BasePopup hide-header position="start">
    <template #trigger="{toggle}">
      <PropertyCell :label="active.label" @click="toggle">
        <template #icon>
          <BaseIcon :name="active.icon" :class="['size-4', active.titleClass]" />
        </template>
      </PropertyCell>
    </template>

    <template #default="{hide}">
      <StatusCombobox :options="options" :status="activeStatus" @update="selectStatus" @close="hide" />
    </template>
  </BasePopup>
</template>
