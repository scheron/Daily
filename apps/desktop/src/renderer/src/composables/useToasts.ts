import {toasts as localToasts} from "vue-toasts-lite"

import type {ToastMessage} from "@shared/types/toast"

export function useToasts(target: "main" | "current" = "main") {
  const publish = (type: ToastMessage["type"], message: string) => {
    if (target === "current") {
      localToasts[type](message)
    } else {
      window.BridgeIPC["toast:publish"]({type, message})
    }
  }

  return {
    error: (message: string) => publish("error", message),
    info: (message: string) => publish("info", message),
    success: (message: string) => publish("success", message),
  }
}

export const toasts = useToasts()
