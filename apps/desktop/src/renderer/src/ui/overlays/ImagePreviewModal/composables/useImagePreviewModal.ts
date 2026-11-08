import {useBaseModal} from "@/composables/useBaseModal"
import ImagePreviewModal from "../ImagePreviewModal.vue"

export function useImagePreviewModal() {
  const {show, hide} = useBaseModal("image-preview")

  function open(src: string | null, alt?: string) {
    show(ImagePreviewModal, {src, alt, onClose: hide})
  }

  return {open}
}
