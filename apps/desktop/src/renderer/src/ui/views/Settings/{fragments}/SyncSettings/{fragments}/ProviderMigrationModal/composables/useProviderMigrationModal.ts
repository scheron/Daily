import {useBaseModal} from "@/composables/useBaseModal"
import ProviderMigrationModal from "../ProviderMigrationModal.vue"

import type {SyncProvider} from "@daily/protocol"

export function useProviderMigrationModal() {
  const {show, hide} = useBaseModal("sync-provider-migration")

  function open(target: SyncProvider, onDone: () => Promise<void>) {
    show(ProviderMigrationModal, {
      target,
      onClose: hide,
      async onDone() {
        hide()
        await onDone()
      },
    })
  }

  return {open}
}
