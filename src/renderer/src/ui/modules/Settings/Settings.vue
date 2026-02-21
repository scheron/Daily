<script setup lang="ts">
import {isDevMode} from "@/constants/env"
import BaseIcon from "@/ui/base/BaseIcon"
import ExpansionPanel from "@/ui/common/misc/ExpansionPanel/ExpansionPanel.vue"

import About from "./{fragments}/About.vue"
import AiSettings from "./{fragments}/AiSettings"
import DeletedTasks from "./{fragments}/DeletedTasks"
import IconsList from "./{fragments}/IconsList.vue"
import LayoutSettings from "./{fragments}/LayoutSettings"
import SyncSettings from "./{fragments}/SyncSettings.vue"
import ThemesSettings from "./{fragments}/ThemesSettings"

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
        <ThemesSettings />
      </div>
    </ExpansionPanel>

    <ExpansionPanel :group="COMMON_GROUP">
      <template #header>
        <h3 class="text-base-content flex items-center gap-2 text-sm font-semibold">
          <BaseIcon name="layout" class="text-accent size-4" />
          Layout
        </h3>
      </template>
      <LayoutSettings />
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

    <template v-if="isDevMode">
      <ExpansionPanel :group="COMMON_GROUP">
        <template #header>
          <h3 class="text-base-content flex items-center gap-2 text-sm font-semibold">
            <BaseIcon name="heading" class="text-accent size-4" />
            Icons
          </h3>
        </template>
        <IconsList />
      </ExpansionPanel>
    </template>
  </div>
</template>
