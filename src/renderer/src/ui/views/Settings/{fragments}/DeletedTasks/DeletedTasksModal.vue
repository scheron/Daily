<script setup lang="ts">
import {useUIStore} from "@/stores/ui.store"
import BaseModal from "@/ui/base/BaseModal.vue"

import DeletedTasks from "./DeletedTasks.vue"

const uiStore = useUIStore()
</script>

<template>
  <BaseModal
    :open="uiStore.isDeletedTasksModalOpen"
    hide-header
    container-class="max-h-[70vh] w-[500px]"
    content-class="overflow-hidden"
    @close="uiStore.closeDeletedTasksModal()"
  >
    <DeletedTasks class="h-full" />
  </BaseModal>
</template>
