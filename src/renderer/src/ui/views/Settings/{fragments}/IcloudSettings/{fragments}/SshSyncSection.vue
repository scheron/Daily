<script setup lang="ts">
import {computed, onMounted, ref} from "vue"

import {toLocaleTime} from "@shared/utils/date/formatters"
import {useSettingsStore} from "@/stores/settings.store"
import BaseButton from "@/ui/base/BaseButton"
import BaseSwitch from "@/ui/base/BaseSwitch.vue"

import SettingRow from "../../SettingRow.vue"

import type {SyncRemoteState} from "@shared/types/storage"

const settingsStore = useSettingsStore()

const host = ref("")
const dir = ref("")
const remoteStates = ref<SyncRemoteState[]>([])

const ssh = computed(() => settingsStore.settings?.sync?.ssh ?? null)
const isEnabled = computed(() => ssh.value?.enabled ?? false)
const sshState = computed(() => remoteStates.value.find((state) => state.id === "ssh") ?? null)
const canApply = computed(() => host.value.trim().length > 0 && dir.value.trim().length > 0)

onMounted(() => {
  host.value = ssh.value?.host ?? ""
  dir.value = ssh.value?.dir ?? ""
  void refreshStates()
})

function saveSsh(enabled: boolean) {
  if (!settingsStore.settings) return

  settingsStore.updateSettings({
    sync: {
      ...settingsStore.settings.sync,
      ssh: {enabled, host: host.value.trim(), dir: dir.value.trim()},
    },
  })
}

function onToggle(enabled: boolean) {
  saveSsh(enabled && canApply.value)
}

function onApply() {
  saveSsh(isEnabled.value)
  void refreshStates()
}

async function refreshStates() {
  remoteStates.value = await window.BridgeIPC["storage-sync:get-remote-states"]()
}
</script>

<template>
  <SettingRow title="SSH Node" description="Sync with an external CLI node over SSH">
    <BaseSwitch :modelValue="isEnabled" :disabled="!canApply && !isEnabled" @update:modelValue="onToggle" />

    <template #below>
      <div class="flex flex-col gap-2 py-2.5">
        <label class="flex flex-col gap-1">
          <span class="text-base-content/60 text-xs">Host (alias from ~/.ssh/config)</span>
          <input
            v-model="host"
            type="text"
            placeholder="my-server"
            class="border-base-300 bg-base-200 text-base-content rounded-md border px-2 py-1.5 text-sm outline-none"
          />
        </label>

        <label class="flex flex-col gap-1">
          <span class="text-base-content/60 text-xs">Remote sync folder</span>
          <input
            v-model="dir"
            type="text"
            placeholder="/home/agent/.local/share/daily/sync"
            class="border-base-300 bg-base-200 text-base-content rounded-md border px-2 py-1.5 text-sm outline-none"
          />
        </label>

        <div class="border-base-300 flex items-center justify-between border-t py-1">
          <span class="text-base-content/40 text-xs">
            <template v-if="sshState?.lastError">Last error: {{ sshState.lastError }}</template>
            <template v-else-if="sshState?.lastSyncAt">Last sync: {{ toLocaleTime(sshState.lastSyncAt) }}</template>
            <template v-else>Never synced</template>
          </span>

          <BaseButton variant="ghost" size="sm" class="text-accent hover:bg-accent/10 -mr-1 text-xs" :disabled="!canApply" @click="onApply">
            Apply
          </BaseButton>
        </div>
      </div>
    </template>
  </SettingRow>
</template>
