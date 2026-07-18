import {withResolvers} from "@shared/utils/common/withResolvers"
import {useBaseModal} from "@/ui/base/BaseModal"

import SshNodeModal from "./SshNodeModal.vue"

const SSH_NODE_MODAL_ID = "ssh-node"

export type SshNodeConfig = {host: string; dir: string}

/**
 * Opens the SSH node configuration modal. `open()` resolves with the entered
 * `{host, dir}` when the user applies, or `null` when cancelled/dismissed.
 *
 * @example
 * const {open} = useSshNodeModal()
 * const config = await open({host: "", dir: ""})
 * if (config) save(config)
 */
export function useSshNodeModal() {
  const {show, hide, isOpen} = useBaseModal(SSH_NODE_MODAL_ID)

  let {promise, resolve} = withResolvers<SshNodeConfig | null>()

  function open(initial: SshNodeConfig): Promise<SshNodeConfig | null> {
    ;({promise, resolve} = withResolvers<SshNodeConfig | null>())

    show(SshNodeModal, {
      host: initial.host,
      dir: initial.dir,
      onApply: (config: SshNodeConfig) => {
        hide()
        resolve(config)
      },
      onClose: () => {
        hide()
        resolve(null)
      },
    })

    return promise
  }

  return {isOpen, open}
}
