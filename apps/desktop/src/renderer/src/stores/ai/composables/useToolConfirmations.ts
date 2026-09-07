import {ref} from "vue"

import type {PendingToolConfirmation} from "@shared/types/ai"

/**
 * Owns the pending destructive-tool confirmation raised by the agent loop: tracks it,
 * resolves it via IPC on confirm/cancel, and clears it when the main process reports
 * it resolved.
 */
export function useToolConfirmations() {
  const pendingConfirmation = ref<PendingToolConfirmation | null>(null)

  window.BridgeIPC["ai:on-confirmation-required"]((c) => {
    pendingConfirmation.value = c
  })
  window.BridgeIPC["ai:on-confirmation-resolved"](({confirmationId}) => {
    if (pendingConfirmation.value?.id === confirmationId) {
      pendingConfirmation.value = null
    }
  })

  async function confirmPendingToolCall(): Promise<void> {
    const id = pendingConfirmation.value?.id
    if (!id) return

    await window.BridgeIPC["ai:confirm-tool-call"](id)
    pendingConfirmation.value = null
  }

  async function cancelPendingToolCall(): Promise<void> {
    const id = pendingConfirmation.value?.id
    if (!id) return

    await window.BridgeIPC["ai:cancel-tool-call"](id)
    pendingConfirmation.value = null
  }

  function resetConfirmation() {
    pendingConfirmation.value = null
  }

  return {
    pendingConfirmation,
    confirmPendingToolCall,
    cancelPendingToolCall,
    resetConfirmation,
  }
}
