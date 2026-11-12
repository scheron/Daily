<script setup lang="ts">
import {computed, ref} from "vue"

import {NO_PROJECT_ID} from "@daily/protocol"

import {useBranchesStore} from "@/stores/branches"
import WorkflowGuidanceEditor from "@/ui/common/(editors)/WorkflowGuidanceEditor"
import SettingsGroup from "@/ui/views/Settings/{fragments}/SettingsGroup.vue"
import MilestonesForm from "./{fragments}/MilestonesForm"
import ProjectDescription from "./{fragments}/ProjectDescription.vue"
import ProjectsForm from "./{fragments}/ProjectsForm"
import TagsForm from "./{fragments}/TagsForm.vue"

import type {Branch, WorkflowGuidanceScope} from "@daily/protocol"

const branchesStore = useBranchesStore()

const selectedBranchId = ref<Branch["id"]>(branchesStore.activeBranchId ?? NO_PROJECT_ID)

const guidanceScope = computed<WorkflowGuidanceScope>(() => ({kind: "project", projectId: selectedBranchId.value}))
</script>

<template>
  <div class="flex flex-col gap-6 py-2">
    <ProjectsForm :selected-id="selectedBranchId" @select="selectedBranchId = $event" />

    <SettingsGroup label="Description" icon="pencil">
      <ProjectDescription :branch-id="selectedBranchId" />
    </SettingsGroup>

    <SettingsGroup label="Agent guidance" icon="bot">
      <WorkflowGuidanceEditor :scope="guidanceScope" />
    </SettingsGroup>

    <SettingsGroup label="Milestones" icon="milestone">
      <MilestonesForm :branch-id="selectedBranchId" />
    </SettingsGroup>

    <SettingsGroup label="Tags" icon="tags">
      <TagsForm :branch-id="selectedBranchId" />
    </SettingsGroup>
  </div>
</template>
