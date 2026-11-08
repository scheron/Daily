<script setup lang="ts">
import FocusBreak from "./{fragments}/FocusBreak.vue"
import FocusCollect from "./{fragments}/FocusCollect"
import FocusCurrent from "./{fragments}/FocusCurrent.vue"
import FocusSummary from "./{fragments}/FocusSummary.vue"

import type {FocusSession} from "@shared/types/focus"

defineProps<{session: FocusSession; shouldAcceptCards?: boolean}>()
</script>

<template>
  <div class="flex min-h-0 flex-1 flex-col gap-3.5 overflow-y-auto p-5">
    <FocusCollect v-if="session.phase === 'collect'" :should-accept-cards="shouldAcceptCards" />
    <FocusCurrent v-else-if="session.phase === 'focus' || session.phase === 'pause'" :session="session" />
    <FocusBreak v-else-if="session.phase === 'break'" :session="session" />
    <FocusSummary v-else :session="session" />
  </div>
</template>
