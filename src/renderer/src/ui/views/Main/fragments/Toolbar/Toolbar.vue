<script setup lang="ts">
import {computed} from "vue"

import {useTaskEditorStore} from "../../model/taskEditor.store"
import PanelEdit from "./fragments/PanelEdit.vue"
import PanelFilters from "./fragments/PanelFilters.vue"

const taskEditorStore = useTaskEditorStore()

const activeState = computed(() => (taskEditorStore.isTaskEditorOpen ? "edit" : "filter"))
</script>

<template>
  <PanelEdit v-if="activeState === 'edit'" />
  <PanelFilters v-else />
</template>
