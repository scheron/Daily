<script setup lang="ts">
import {BaseModal} from "@daily/ui/base"

import {useUIStore} from "@/stores/ui.store"
import InfoPanel from "@/ui/features/InfoPanel"

const uiStore = useUIStore()

function onClose() {
  uiStore.toggleIsInfoPanelOpen(false)
  uiStore.setIsCalendarOpen(false)
}
</script>

<template>
  <BaseModal :open="uiStore.isInfoPanelOpen" @close="onClose">
    <InfoPanel mobile />
  </BaseModal>
</template>
