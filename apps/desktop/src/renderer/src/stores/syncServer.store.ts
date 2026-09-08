import {ref} from "vue"
import {invoke} from "@vueuse/core"
import {defineStore} from "pinia"

import {useBaseModal} from "@/ui/base/BaseModal"
import ApproveDeviceModal from "@/ui/views/Settings/{fragments}/SyncSettings/{fragments}/ApproveDeviceModal.vue"

import type {
  EnrollmentPollView,
  EnrollmentTicketView,
  PendingApprovalView,
  ProtocolMismatchView,
  ServerBindingView,
  ServerProbeView,
} from "@daily/protocol"

const APPROVE_DEVICE_MODAL_ID = "sync-server-approve-device"

export const useSyncServerStore = defineStore("syncServer", () => {
  const binding = ref<ServerBindingView | null>(null)
  const revoked = ref(false)
  const mismatch = ref<ProtocolMismatchView | null>(null)
  let isWatchingApprovals = false

  const {show: showApproval, hide: hideApproval} = useBaseModal(APPROVE_DEVICE_MODAL_ID)

  async function loadState(): Promise<void> {
    try {
      const state = await window.BridgeIPC["sync-server:get-state"]()
      binding.value = state.binding
      revoked.value = state.revoked
      mismatch.value = state.mismatch
    } catch (error) {
      console.error("Failed to load the Daily Sync Server state:", error)
    }
  }

  async function defaultDeviceName(): Promise<string> {
    return window.BridgeIPC["sync-server:default-device-name"]()
  }

  async function probe(baseUrl: string): Promise<ServerProbeView> {
    return window.BridgeIPC["sync-server:probe"](baseUrl)
  }

  async function claim(code: string, deviceName: string, confirmInsecure: boolean): Promise<ServerBindingView> {
    const result = await window.BridgeIPC["sync-server:claim"](code, deviceName, confirmInsecure)
    await loadState()
    return result
  }

  async function requestEnrollment(deviceName: string, confirmInsecure: boolean): Promise<EnrollmentTicketView> {
    return window.BridgeIPC["sync-server:request-enrollment"](deviceName, confirmInsecure)
  }

  async function pollEnrollment(): Promise<EnrollmentPollView> {
    const result = await window.BridgeIPC["sync-server:poll-enrollment"]()
    if (result.state === "approved") await loadState()
    return result
  }

  async function cancelConnection(): Promise<void> {
    try {
      await window.BridgeIPC["sync-server:cancel-connection"]()
    } catch (error) {
      console.error("Failed to cancel the connection attempt:", error)
    }
  }

  async function disconnect(): Promise<void> {
    await window.BridgeIPC["sync-server:disconnect"]()
    await loadState()
  }

  async function getPendingApproval(): Promise<PendingApprovalView | null> {
    return window.BridgeIPC["sync-server:get-pending-approval"]()
  }

  async function approve(requestId: string, code: string): Promise<void> {
    await window.BridgeIPC["sync-server:approve"](requestId, code)
  }

  async function deny(requestId: string): Promise<void> {
    await window.BridgeIPC["sync-server:deny"](requestId)
  }

  async function openApprovalDialog(): Promise<void> {
    const pending = await getPendingApproval()
    if (!pending) return

    showApproval(ApproveDeviceModal, {
      request: pending,
      onApprove: async () => {
        await approve(pending.requestId, pending.code)
        hideApproval()
      },
      onDeny: async () => {
        await deny(pending.requestId)
        hideApproval()
      },
      onClose: () => hideApproval(),
    })
  }

  /**
   * Subscribes to a peer's enrollment request and opens the dialog for it: the edge (a fresh
   * broadcast) and the level (one already waiting when this runs) both resolve through the same
   * `openApprovalDialog()` check, so a request that arrived while nothing was listening — the
   * app was closed, or open only in a window that never called this — is still found once this
   * does run.
   *
   * The broadcast reaches every window's renderer process, so call this from exactly one of
   * them; calling it from more than one opens the dialog twice for the same request.
   */
  function watchForApprovals(): void {
    if (isWatchingApprovals) return
    isWatchingApprovals = true

    window.BridgeIPC["sync-server:on-approval-requested"](() => {
      openApprovalDialog()
    })
    openApprovalDialog()
  }

  window.BridgeIPC["sync-server:on-revoked"](() => {
    revoked.value = true
  })

  window.BridgeIPC["sync-server:on-protocol-mismatch-changed"]((nextMismatch) => {
    mismatch.value = nextMismatch
  })

  invoke(loadState)

  return {
    binding,
    revoked,
    mismatch,

    loadState,
    defaultDeviceName,
    probe,
    claim,
    requestEnrollment,
    pollEnrollment,
    cancelConnection,
    disconnect,
    getPendingApproval,
    approve,
    deny,
    watchForApprovals,
  }
})
