<script setup lang="ts">
import {computed, onMounted, ref, watch} from "vue"

import {useSettingsStore} from "@/stores/settings.store"
import {useStorageStore} from "@/stores/storage.store"
import BaseButton from "@/ui/base/BaseButton"
import BaseIcon from "@/ui/base/BaseIcon"
import BaseSwitch from "@/ui/base/BaseSwitch.vue"

import SettingRow from "../../SettingRow.vue"
import {useSshNodeModal} from "./useSshNodeModal"

import type {SyncRemoteState} from "@shared/types/storage"
import type {SshNodeConfig} from "./useSshNodeModal"

const settingsStore = useSettingsStore()
const storageStore = useStorageStore()
const {open: openSshModal} = useSshNodeModal()

const remoteStates = ref<SyncRemoteState[]>([])

const ssh = computed(() => settingsStore.settings?.sync?.ssh ?? null)
const isEnabled = computed(() => ssh.value?.enabled ?? false)
const isConfigured = computed(() => Boolean(ssh.value?.host && ssh.value?.dir))
const sshState = computed(() => remoteStates.value.find((state) => state.id === "ssh") ?? null)
const isSyncing = computed(() => storageStore.status === "syncing" && isEnabled.value)

const dotClass = computed(() => {
  if (!isEnabled.value) return "bg-base-content/30"
  if (sshState.value?.lastError) return "bg-error"
  if (sshState.value?.lastSyncAt) return "bg-success"
  return "bg-base-content/30"
})

onMounted(() => {
  void refreshStates()
})

watch(isSyncing, (syncing, wasSyncing) => {
  if (wasSyncing && !syncing) void refreshStates()
})

async function onConfigure() {
  const config = await openSshModal(currentConfig())
  if (!config) return
  saveSsh(isEnabled.value, config)
  await refreshStates()
}

async function onToggle(enabled: boolean) {
  if (!enabled) return saveSsh(false, currentConfig())
  if (isConfigured.value) return saveSsh(true, currentConfig())

  const config = await openSshModal(currentConfig())
  if (!config) return
  saveSsh(true, config)
  await refreshStates()
}

function currentConfig(): SshNodeConfig {
  return {host: ssh.value?.host ?? "", dir: ssh.value?.dir ?? ""}
}

function saveSsh(enabled: boolean, config: SshNodeConfig) {
  if (!settingsStore.settings) return

  settingsStore.updateSettings({
    sync: {
      ...settingsStore.settings.sync,
      ssh: {enabled, host: config.host.trim(), dir: config.dir.trim()},
    },
  })
}

async function refreshStates() {
  remoteStates.value = await window.BridgeIPC["storage-sync:get-remote-states"]()
}
</script>

<template>
  <SettingRow description="Sync with an external CLI node over SSH">
    <template #title>
      <div class="flex items-center gap-2">
        <p class="text-base-content text-sm">SSH Node</p>

        <span class="flex size-4 shrink-0 items-center justify-center">
          <BaseIcon v-if="isSyncing" name="spinner" class="text-accent size-3.5 animate-spin" />
          <span v-else class="size-2 rounded-full" :class="dotClass" />
        </span>
      </div>
    </template>

    <div class="flex items-center gap-2.5">
      <BaseButton variant="outline" size="sm" class="text-xs" @click="onConfigure"> Configure </BaseButton>

      <BaseSwitch :modelValue="isEnabled" @update:modelValue="onToggle" />
    </div>
  </SettingRow>
</template>
