<script setup lang="ts">
import {ref} from "vue"

import {MAIN_BRANCH_ID} from "@daily/protocol"

import {useBranchesStore} from "@/stores/branches.store"
import SettingsGroup from "@/ui/views/Settings/{fragments}/SettingsGroup.vue"
import MilestonesForm from "./{fragments}/MilestonesForm"
import ProjectDescription from "./{fragments}/ProjectDescription.vue"
import ProjectsForm from "./{fragments}/ProjectsForm.vue"
import TagsForm from "./{fragments}/TagsForm.vue"

import type {Branch} from "@daily/protocol"

const branchesStore = useBranchesStore()

const selectedBranchId = ref<Branch["id"]>(branchesStore.activeBranchId ?? MAIN_BRANCH_ID)
</script>

<template>
  <div class="flex flex-col gap-6 py-2">
    <ProjectsForm :selected-id="selectedBranchId" @select="selectedBranchId = $event" />

    <SettingsGroup label="Description" icon="pencil">
      <ProjectDescription :branch-id="selectedBranchId" />
    </SettingsGroup>

    <SettingsGroup label="Milestones" icon="milestone">
      <MilestonesForm :branch-id="selectedBranchId" />
    </SettingsGroup>

    <SettingsGroup label="Tags" icon="tags">
      <TagsForm :branch-id="selectedBranchId" />
    </SettingsGroup>
  </div>
</template>
