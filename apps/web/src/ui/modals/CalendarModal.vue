<script setup lang="ts">
import {BaseModal} from "@daily/ui/base"

import {useUIStore} from "@/stores/ui.store"
import Calendar from "@/ui/features/Calendar"

const uiStore = useUIStore()

function onClose() {
  uiStore.setIsCalendarOpen(false)
  uiStore.toggleIsInfoPanelOpen(false)
}
</script>

<template>
  <BaseModal :open="uiStore.isCalendarOpen" @close="onClose">
    <Calendar />
  </BaseModal>
</template>
