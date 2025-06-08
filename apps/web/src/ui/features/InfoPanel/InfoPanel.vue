<script setup lang="ts">
import {BasePanel} from "@daily/ui/base"

import About from "./fragments/About.vue"
import Shortcuts from "./fragments/Shortcuts.vue"
import TaskWorkflow from "./fragments/TaskWorkflow.vue"
import Themes from "./fragments/Themes.vue"

defineProps<{mobile?: boolean}>()
</script>

<template>
  <div class="flex w-full cursor-auto flex-col">
    <BasePanel label="About" icon="star" opened class="border-base-300 border-b">
      <About />
    </BasePanel>
    <BasePanel label="Themes" icon="background" :opened="mobile" :group="mobile ? undefined : 'guide-lines'" class="border-base-300 border-b">
      <Themes />
    </BasePanel>
    <BasePanel label="Task workflow" icon="fire" :opened="mobile" :group="mobile ? undefined : 'guide-lines'" class="border-base-300 border-b">
      <TaskWorkflow />
    </BasePanel>
    <BasePanel v-if="!mobile" label="Shortcuts" icon="keyboard" group="guide-lines">
      <Shortcuts />
    </BasePanel>
  </div>
</template>
