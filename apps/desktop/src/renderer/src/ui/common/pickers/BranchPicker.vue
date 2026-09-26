<script setup lang="ts">
import BasePopup from "@/ui/base/BasePopup.vue"
import BranchCombobox from "@/ui/common/comboboxes/BranchCombobox.vue"

import type {HorizontalPosition} from "@/ui/base/BasePopup.vue"
import type {Branch} from "@daily/protocol"

withDefaults(
  defineProps<{
    selectedId: Branch["id"] | null
    position?: HorizontalPosition
    side?: "top" | "bottom"
    triggerClass?: string
    hoverMode?: boolean
  }>(),
  {
    position: "start",
    side: "bottom",
    hoverMode: false,
  },
)

const emit = defineEmits<{select: [branch: Branch]}>()
</script>

<template>
  <BasePopup
    hide-header
    :hover-mode="hoverMode"
    :side="side"
    :position="position"
    :trigger-class="triggerClass"
    container-class="p-0 overflow-hidden max-h-none"
  >
    <template #trigger="{toggle, show}">
      <slot name="trigger" :toggle="toggle" :show="show" />
    </template>

    <template #default="{hide}">
      <BranchCombobox :selected-id="selectedId" @select="emit('select', $event)" @close="hide" />
    </template>
  </BasePopup>
</template>
