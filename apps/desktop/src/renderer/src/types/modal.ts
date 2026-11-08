import type {DefineComponent} from "vue"

export type ModalItem = {
  id: string
  component: DefineComponent<Record<string, unknown>, Record<string, unknown>, unknown>
  props: Record<string, unknown>
  /** Set when dismissed so the host can play the leave transition before removal. */
  closing: boolean
}
