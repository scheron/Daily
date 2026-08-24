<script setup lang="ts">
import {computed, onMounted, ref} from "vue"

import {useStorageStore} from "../../../../../../stores/storage.store"
import {useSyncServerStore} from "../../../../../../stores/syncServer.store"
import BaseButton from "../../../../../base/BaseButton"
import BaseIcon from "../../../../../base/BaseIcon"
import {BaseModal} from "../../../../../base/BaseModal"
import {CONNECT_STEP_TITLES} from "./connectSteps"
import ServerConnectSteps from "./ServerConnectSteps.vue"

import type {MigrationDirection, MigrationPreview, ProviderCounts, SyncProvider} from "@daily/protocol"
import type {ConnectStep} from "./connectSteps"

type ModalStep = "connect" | "confirm-off" | "preview"

const props = defineProps<{target: SyncProvider}>()
const emit = defineEmits<{close: []; done: []}>()

const storageStore = useStorageStore()
const syncServerStore = useSyncServerStore()

const step = ref<ModalStep>(initialStep())
const connectStep = ref<ConnectStep>("address")
const preview = ref<MigrationPreview | null>(null)
const direction = ref<MigrationDirection | null>(null)
const errorMessage = ref<string | null>(null)
const isLoading = ref(false)

const title = computed(() => {
  if (step.value === "connect") return CONNECT_STEP_TITLES[connectStep.value]
  if (step.value === "confirm-off") return "Stop syncing?"
  return "Switch sync provider"
})

const canSwitch = computed(() => {
  if (!preview.value) return false
  if (!preview.value.targetHasSnapshot) return true
  return direction.value !== null
})

const conflictTotal = computed(() => (preview.value ? totalOf(preview.value.conflicts) : 0))

function initialStep(): ModalStep {
  if (props.target === "off") return "confirm-off"
  if (props.target === "server" && !syncServerStore.binding) return "connect"
  return "preview"
}

function totalOf(counts: ProviderCounts): number {
  return counts.tasks + counts.tags + counts.branches
}

async function loadPreview() {
  if (props.target === "off") return

  errorMessage.value = null
  isLoading.value = true
  try {
    preview.value = await storageStore.previewMigration(props.target)
    if (!preview.value.targetHasSnapshot || conflictTotal.value === 0) direction.value = "keep-local"
  } catch (error) {
    errorMessage.value = messageOf(error)
  } finally {
    isLoading.value = false
  }
}

function onBound() {
  step.value = "preview"
  loadPreview()
}

async function onConfirmOff() {
  if (isLoading.value) return

  errorMessage.value = null
  isLoading.value = true
  try {
    await storageStore.migrateProvider("off", null)
    emit("done")
  } catch (error) {
    errorMessage.value = messageOf(error)
  } finally {
    isLoading.value = false
  }
}

async function onSwitch() {
  if (!canSwitch.value || isLoading.value) return

  errorMessage.value = null
  isLoading.value = true
  try {
    await storageStore.migrateProvider(props.target, direction.value ?? "keep-local")
    emit("done")
  } catch (error) {
    errorMessage.value = messageOf(error)
  } finally {
    isLoading.value = false
  }
}

function messageOf(error: unknown): string {
  const message = error instanceof Error ? error.message : "Something went wrong"

  return message.replace(/^Error invoking remote method '[^']+':\s*/, "").replace(/^[A-Za-z]*Error:\s*/, "")
}

onMounted(() => {
  if (step.value === "preview") loadPreview()
})
</script>

<template>
  <BaseModal :title="title" container-class="mx-4 h-auto w-full max-w-md rounded-xl" content-class="!p-5" @close="$emit('close')">
    <p v-if="errorMessage" class="bg-error/10 text-error mb-4 rounded-lg px-3 py-2 text-sm">{{ errorMessage }}</p>

    <ServerConnectSteps v-if="step === 'connect'" v-model:step="connectStep" @bound="onBound" />

    <div v-else-if="step === 'confirm-off'" class="flex flex-col gap-4">
      <p class="text-base-content/80 text-sm">Stop syncing? Your data stays on this Mac and on the server.</p>

      <div class="flex items-center justify-end gap-2">
        <BaseButton variant="text" size="sm" @click="$emit('close')">Cancel</BaseButton>
        <BaseButton variant="primary" size="sm" :loading="isLoading" @click="onConfirmOff">Stop Syncing</BaseButton>
      </div>
    </div>

    <div v-else-if="step === 'preview' && isLoading && !preview" class="flex items-center justify-center py-6">
      <BaseIcon name="spinner" class="text-base-content/40 size-5 animate-spin" />
    </div>

    <div v-else-if="step === 'preview' && preview" class="flex flex-col gap-4">
      <p class="text-base-content/80 text-sm">Nothing is lost for being on only one side.</p>

      <div class="border-base-300 bg-base-200/40 flex flex-col gap-2 rounded-lg border p-3 text-sm">
        <div class="flex items-center justify-between">
          <span class="text-base-content/60">This Mac</span>
          <span class="text-base-content font-medium">
            {{ preview.local.tasks }} tasks · {{ preview.local.tags }} tags · {{ preview.local.branches }} branches
          </span>
        </div>
        <div class="flex items-center justify-between">
          <span class="text-base-content/60">{{ preview.targetName }}</span>
          <span class="text-base-content font-medium">
            {{ preview.remote.tasks }} tasks · {{ preview.remote.tags }} tags · {{ preview.remote.branches }} branches
          </span>
        </div>
      </div>

      <p v-if="!preview.targetHasSnapshot" class="text-base-content/60 text-sm">{{ preview.targetName }} is empty — nothing to merge.</p>

      <template v-else>
        <p class="text-base-content/60 text-xs">
          {{ totalOf(preview.onlyOnLocal) }} item(s) only on this Mac, {{ totalOf(preview.onlyOnRemote) }} item(s) only on {{ preview.targetName }}.
        </p>

        <template v-if="conflictTotal > 0">
          <p class="text-base-content/60 text-xs">
            {{ conflictTotal }} item(s) were edited or deleted on both this Mac and {{ preview.targetName }} — choose which version wins, since that
            can make the item disappear.
          </p>

          <div class="flex flex-col gap-2">
            <label class="border-base-300 flex cursor-pointer items-start gap-2 rounded-lg border p-3 text-sm">
              <input v-model="direction" type="radio" name="direction" value="keep-local" class="accent-accent mt-0.5" />
              <span class="text-base-content/80">This Mac's version</span>
            </label>
            <label class="border-base-300 flex cursor-pointer items-start gap-2 rounded-lg border p-3 text-sm">
              <input v-model="direction" type="radio" name="direction" value="keep-target" class="accent-accent mt-0.5" />
              <span class="text-base-content/80">{{ preview.targetName }}'s version</span>
            </label>
          </div>
        </template>
      </template>

      <div class="flex items-center justify-end gap-2">
        <BaseButton variant="text" size="sm" @click="$emit('close')">Cancel</BaseButton>
        <BaseButton variant="primary" size="sm" :disabled="!canSwitch" :loading="isLoading" @click="onSwitch">Switch</BaseButton>
      </div>
    </div>
  </BaseModal>
</template>
