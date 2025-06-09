<script setup lang="ts">
import BaseButton from "@/ui/base/BaseButton.vue"
import BaseModal from "@/ui/base/BaseModal.vue"
import Calendar from "@/ui/features/Calendar"
import {useUIStore} from "@/stores/ui.store"

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
