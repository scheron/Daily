import {useResizeObserver} from "@vueuse/core"

import type {Ref} from "vue"

/** @param panel - the element whose rendered height is the window's height */
export function useReportPanelHeight(panel: Ref<HTMLElement | null>) {
  useResizeObserver(panel, ([entry]) => {
    window.BridgeIPC["quick-task:resize"](Math.ceil(entry.target.getBoundingClientRect().height))
  })
}
