import {useResizeObserver} from "@vueuse/core"

import type {MaybeRefOrGetter} from "vue"

export function watchReportPanelHeight(panel: MaybeRefOrGetter<HTMLElement | null>) {
  useResizeObserver(panel, ([entry]) => {
    window.BridgeIPC["quick-task:resize"](Math.ceil(entry.target.getBoundingClientRect().height))
  })
}
