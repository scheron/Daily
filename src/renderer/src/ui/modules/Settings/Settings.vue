<script setup lang="ts">
import BaseIcon from "@/ui/base/BaseIcon"
import ExpansionPanel from "@/ui/common/misc/ExpansionPanel/ExpansionPanel.vue"

import About from "./{fragments}/About.vue"
import AiSettings from "./{fragments}/AiSettings"
import DeletedTasks from "./{fragments}/DeletedTasks"
import SyncSettings from "./{fragments}/SyncSettings.vue"
import Themes from "./{fragments}/Themes.vue"
import IconsList from "../IconsList"

const COMMON_GROUP = "settings"
</script>

<template>
  <div>
    <About class="px-4 pt-4" />

    <ExpansionPanel :group="COMMON_GROUP">
      <template #header>
        <h3 class="text-base-content flex items-center gap-2 text-sm font-semibold">
          <BaseIcon name="ai" class="text-accent size-4" />
          AI Settings
        </h3>
      </template>
      <AiSettings />
    </ExpansionPanel>

    <ExpansionPanel :group="COMMON_GROUP">
      <template #header>
        <h3 class="text-base-content flex items-center gap-2 text-sm font-semibold">
          <BaseIcon name="background" class="text-accent size-4" />
          Themes
        </h3>
      </template>
      <div class="overflow-y-auto">
        <Themes />
      </div>
    </ExpansionPanel>
    <ExpansionPanel :group="COMMON_GROUP">
      <template #header>
        <h3 class="text-base-content flex items-center gap-2 text-sm font-semibold">
          <BaseIcon name="cloud" class="text-accent size-4" />
          iCloud Sync
        </h3>
      </template>
      <SyncSettings />
    </ExpansionPanel>

    <ExpansionPanel :group="COMMON_GROUP">
      <template #header>
        <h3 class="text-base-content flex items-center gap-2 text-sm font-semibold">
          <BaseIcon name="book-x" class="text-accent size-4" />
          Deleted Tasks
        </h3>
      </template>
      <DeletedTasks />
    </ExpansionPanel>

    <ExpansionPanel :group="COMMON_GROUP">
      <template #header>
        <h3 class="text-base-content flex items-center gap-2 text-sm font-semibold">
          <BaseIcon name="heading" class="text-accent size-4" />
          Icons
        </h3>
      </template>
      <IconsList />
    </ExpansionPanel>
  </div>
</template>
