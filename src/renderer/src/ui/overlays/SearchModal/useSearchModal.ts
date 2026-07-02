import {useBaseModal} from "@/ui/base/BaseModal"

import SearchModal from "./SearchModal.vue"

const SEARCH_MODAL_ID = "search"

export function useSearchModal() {
  const {show, hide, isOpen} = useBaseModal(SEARCH_MODAL_ID)

  async function open() {
    show(SearchModal, {onClose: hide})
  }

  function close() {
    hide()
  }

  function toggle() {
    if (isOpen.value) close()
    else open()
  }

  return {isOpen, open, close, toggle}
}
