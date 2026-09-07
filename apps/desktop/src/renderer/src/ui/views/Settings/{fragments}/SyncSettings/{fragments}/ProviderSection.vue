<script setup lang="ts">
import BaseSegmented from "@/ui/base/BaseSegmented.vue"
import SettingRow from "@/ui/views/Settings/{fragments}/SettingRow.vue"

import type {SyncProvider} from "@daily/protocol"

const props = defineProps<{provider: SyncProvider; busy: boolean}>()
const emit = defineEmits<{select: [target: SyncProvider]}>()

const options: {value: SyncProvider; label: string}[] = [
  {value: "off", label: "Off"},
  {value: "icloud", label: "iCloud"},
  {value: "server", label: "Self-hosted Daily"},
]

function onSelect(target: SyncProvider) {
  if (target === props.provider) return
  emit("select", target)
}
</script>

<template>
  <SettingRow title="Sync provider" description="Where this device syncs its tasks">
    <div :class="{'pointer-events-none opacity-50': busy}">
      <BaseSegmented :model-value="provider" :options="options" @update:model-value="onSelect" />
    </div>
  </SettingRow>
</template>
