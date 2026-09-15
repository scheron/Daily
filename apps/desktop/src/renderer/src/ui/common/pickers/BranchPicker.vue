<script setup lang="ts">
import BasePopup from "@/ui/base/BasePopup.vue"
import BranchCombobox from "@/ui/common/comboboxes/BranchCombobox.vue"

import type {HorizontalPosition} from "@/ui/base/BasePopup.vue"
import type {Branch} from "@daily/protocol"

withDefaults(defineProps<{selectedId: Branch["id"] | null; position?: HorizontalPosition}>(), {
  position: "start",
})

const emit = defineEmits<{select: [branch: Branch]}>()
</script>

<template>
  <BasePopup hide-header :position="position" container-class="p-0 overflow-hidden max-h-none">
    <template #trigger="{toggle}">
      <slot name="trigger" :toggle="toggle" />
    </template>

    <template #default="{hide}">
      <BranchCombobox :selected-id="selectedId" @select="emit('select', $event)" @close="hide" />
    </template>
  </BasePopup>
</template>
