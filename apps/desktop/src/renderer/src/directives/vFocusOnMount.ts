import {findFocusableEl} from "@/utils/ui/dom"

export default {
  mounted(el: HTMLElement) {
    setTimeout(() => {
      const focusableElement = findFocusableEl(el)

      if (focusableElement) focusableElement.focus?.()
    }, 0)
  },
}
