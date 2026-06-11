<!-- src/renderer/src/ui/views/Main/{fragments}/Footer/Footer.vue -->
<script setup lang="ts">
import {dropTargetDate} from "@/composables/useDayDropTarget"

import WeekStrip from "./WeekStrip.vue"

const props = defineProps<{activeDay: string}>()
</script>

<template>
  <div class="app-footer border-base-300 h-header border-t px-4">
    <WeekStrip :active-day="props.activeDay" :drop-target-date="dropTargetDate" />
  </div>
</template>
