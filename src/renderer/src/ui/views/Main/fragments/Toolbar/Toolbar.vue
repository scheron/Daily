<script setup lang="ts">
import {computed} from "vue"
import {useTaskEditorStore} from "@/stores/taskEditor.store"

import PanelEdit from "./fragments/PanelEdit.vue"
import PanelFilters from "./fragments/PanelFilters.vue"

const taskEditorStore = useTaskEditorStore()

const activeState = computed(() => (taskEditorStore.isTaskEditorOpen ? "edit" : "filter"))
</script>

<template>
  <div data-tour="toolbar">
    <PanelEdit v-if="activeState === 'edit'" />
    <PanelFilters v-else />
  </div>
</template>
