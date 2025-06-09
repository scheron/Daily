<script setup lang="ts">
import BaseModal from "@/ui/base/BaseModal.vue"
import InfoPanel from "@/ui/features/InfoPanel"
import {useUIStore} from "@/stores/ui.store"

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
