<script setup lang="ts">
import BaseButton from "@/ui/base/BaseButton"
import {useTaskEditor} from "@/ui/modules/RightPanel/composables/useTaskEditor"

const {canSave, close, commitDraftAndClose} = useTaskEditor()
</script>

<template>
  <div class="h-toolbar border-base-300 flex shrink-0 items-center justify-between border-b px-4">
    <div class="flex items-center gap-2" style="-webkit-app-region: no-drag">
      <BaseButton variant="ghost" icon="x-mark" tooltip="Close (Esc)" @click="close" />
    </div>

    <div class="flex items-center gap-1" style="-webkit-app-region: no-drag">
      <BaseButton variant="primary-ghost" icon="check" size="sm" tooltip="Save (⌘S)" :disabled="!canSave" @click="commitDraftAndClose">
        Save
      </BaseButton>
    </div>
  </div>
</template>
