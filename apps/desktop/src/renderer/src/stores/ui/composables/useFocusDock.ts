import {ref} from "vue"

export function useFocusDock() {
  const isFocusDockOpen = ref(false)

  function toggleFocusDock(isOpen?: boolean) {
    isFocusDockOpen.value = isOpen ?? !isFocusDockOpen.value
  }

  return {
    isFocusDockOpen,

    toggleFocusDock,
  }
}
