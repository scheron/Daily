import type {Component, DefineComponent} from "vue"

/** Infers the props object a component accepts, so `show(Component, props)` stays type-checked. */
export type ModalComponentProps<T> = T extends new () => {$props: infer P}
  ? NonNullable<P>
  : T extends (props: infer P, ...args: never[]) => unknown
    ? NonNullable<P>
    : Record<string, never>

export type ModalComponent = DefineComponent<Record<string, unknown>, Record<string, unknown>, unknown>

export type ModalItem = {
  id: string
  component: ModalComponent
  props: Record<string, unknown>
  /** Set when dismissed so the host can play the leave transition before removal. */
  closing: boolean
}

export type ModalShowOptions = {
  /** Reuse a stable id so re-opening replaces the live instance instead of stacking a duplicate. */
  id?: string
}

export type ModalHandle = {
  id: string
  close: () => void
}

export type {Component}
