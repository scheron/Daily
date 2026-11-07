import type {ToastMessage} from "@shared/types/toast"

export function isToastMessage(value: unknown): value is ToastMessage {
  if (!value || typeof value !== "object" || !("type" in value) || !("message" in value)) return false

  return (value.type === "error" || value.type === "info" || value.type === "success") && typeof value.message === "string"
}
