<script setup lang="ts">
import {computed} from "vue"

import {useTaskEditorStore} from "@/stores/taskEditor.store"
import PanelEdit from "./fragments/panels/PanelEdit.vue"
import PanelFilters from "./fragments/panels/PanelFilters.vue"

const taskEditorStore = useTaskEditorStore()

const activeState = computed(() => taskEditorStore.isTaskEditorOpen ? "edit" : "filter")
</script>

<template>
  <PanelEdit v-if="activeState === 'edit'" />
  <PanelFilters v-else />
</template>
