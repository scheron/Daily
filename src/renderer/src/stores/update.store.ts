import {computed, ref} from "vue"
import {toasts} from "vue-toasts-lite"
import {invoke} from "@vueuse/core"
import {defineStore} from "pinia"

import type {AppUpdateState} from "@shared/types/update"

const DEFAULT_UPDATE_STATE: AppUpdateState = {
  status: "idle",
  currentVersion: "",
  availableVersion: null,
  availableHash: null,
  source: null,
  downloadProgress: null,
  downloadedAt: null,
  checkedAt: null,
  reason: null,
}

export const useUpdateStore = defineStore("update", () => {
  const state = ref<AppUpdateState>({...DEFAULT_UPDATE_STATE})
  const isInitialized = ref(false)
  const dismissedVersion = ref<string | null>(null)

  const hasAvailableUpdate = computed(() => Boolean(state.value.availableVersion))
  const isDownloading = computed(() => state.value.status === "downloading")
  const isInstalling = computed(() => state.value.status === "installing")
  const isBusy = computed(() => isDownloading.value || isInstalling.value)
  const canDownload = computed(() => {
    if (state.value.status === "available" || state.value.status === "downloaded") return true
    if (state.value.status === "error" && state.value.availableVersion) return true
    return false
  })
  const isPanelVisible = computed(() => {
    if (!hasAvailableUpdate.value) return false
    if (isBusy.value) return true
    return dismissedVersion.value !== state.value.availableVersion
  })

  async function init(): Promise<void> {
    if (isInitialized.value) return

    state.value = await window.BridgeIPC["updates:get-state"]()
    window.BridgeIPC["updates:on-state-changed"]((nextState) => {
      const previousState = state.value
      state.value = nextState

      if (nextState.availableVersion !== previousState.availableVersion) {
        dismissedVersion.value = null
      }

      if (!nextState.availableVersion) {
        dismissedVersion.value = null
      }

      if (nextState.status === "idle" && nextState.reason && nextState.reason !== previousState.reason) {
        toasts.success(nextState.reason)
      }

      if (nextState.status === "error" && nextState.reason && nextState.reason !== previousState.reason) {
        toasts.error(nextState.reason)
      }
    })

    isInitialized.value = true
  }

  async function checkForUpdates(): Promise<void> {
    state.value = await window.BridgeIPC["updates:check"]()
  }

  async function downloadUpdate(): Promise<boolean> {
    if (!canDownload.value || isBusy.value || state.value.status === "checking") return false

    state.value = {
      ...state.value,
      status: "downloading",
      reason: null,
    }

    return await window.BridgeIPC["updates:download"]()
  }

  function dismissPanel(): void {
    if (!state.value.availableVersion || isBusy.value) return
    dismissedVersion.value = state.value.availableVersion
  }

  invoke(init)

  return {
    state,
    isInitialized,
    hasAvailableUpdate,
    isDownloading,
    isInstalling,
    isBusy,
    canDownload,
    isPanelVisible,
    init,
    checkForUpdates,
    downloadUpdate,
    dismissPanel,
  }
})
