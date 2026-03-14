<script setup lang="ts">
import {useUIStore} from "@/stores/ui.store"
import BaseModal from "@/ui/base/BaseModal.vue"

import SearchForm from "./SearchForm.vue"

const uiStore = useUIStore()
</script>

<template>
  <BaseModal
    :open="uiStore.isSearchModalOpen"
    hide-header
    container-class="max-h-[70vh] w-[600px]"
    content-class="overflow-hidden"
    @close="uiStore.closeSearchModal()"
  >
    <SearchForm class="h-full" />
  </BaseModal>
</template>
