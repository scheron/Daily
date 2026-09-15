import {computed, markRaw, ref} from "vue"

import {createSharedComposable} from "@/composables/createSharedComposable"

import type {ModalItem} from "@/ui/base/BaseModal/types"
import type {Component} from "vue"

type ModalComponentProps<T> = T extends new () => {$props: infer P}
  ? NonNullable<P>
  : T extends (props: infer P, ...args: never[]) => unknown
    ? NonNullable<P>
    : Record<string, never>

const stack = ref<ModalItem[]>([])
let counter = 0

export const useBaseModal = createSharedComposable(
  (boundId?: string) => {
    const isOpen = computed(() => Boolean(boundId) && stack.value.some((modal) => modal.id === boundId && !modal.closing))

    function show<T extends Component>(component: T, props?: ModalComponentProps<T>) {
      const id = boundId ?? `modal-${++counter}`
      const item: ModalItem = {
        id,
        component: markRaw(component) as ModalItem["component"],
        props: (props ?? {}) as Record<string, unknown>,
        closing: false,
      }

      const index = stack.value.findIndex((modal) => modal.id === id)
      if (index >= 0) stack.value.splice(index, 1, item)
      else stack.value.push(item)
    }

    function hide(id = boundId) {
      const target = id ? stack.value.find((modal) => modal.id === id) : stack.value.at(-1)
      if (target) target.closing = true
    }

    function remove(id: string) {
      const index = stack.value.findIndex((modal) => modal.id === id)
      if (index >= 0) stack.value.splice(index, 1)
    }

    return {stack, isOpen, show, hide, remove}
  },
  (boundId) => boundId ?? "__base-modal__",
)
