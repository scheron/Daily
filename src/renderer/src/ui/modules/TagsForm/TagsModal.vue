<script setup lang="ts">
import {useUIStore} from "@/stores/ui.store"
import BaseModal from "@/ui/base/BaseModal.vue"

import TagsForm from "./TagsForm.vue"

const uiStore = useUIStore()
</script>

<template>
  <BaseModal
    :open="uiStore.isTagsModalOpen"
    hide-header
    container-class="max-h-[70vh] w-96"
    content-class="overflow-hidden"
    @close="uiStore.closeTagsModal()"
  >
    <TagsForm class="h-full" />
  </BaseModal>
</template>
