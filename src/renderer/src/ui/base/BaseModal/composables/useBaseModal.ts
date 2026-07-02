import {computed, markRaw, ref} from "vue"

import {createSharedComposable} from "@/composables/createSharedComposable"

import type {Component, ModalComponent, ModalComponentProps, ModalHandle, ModalItem, ModalShowOptions} from "../types"

const DEFAULT_KEY = "__base-modal__"

// One registry shared by every keyed instance and the host. Kept at module scope so
// `useBaseModal("search")` and `useBaseModal()` mutate and render the same stack.
const stack = ref<ModalItem[]>([])
let counter = 0

/**
 * Imperative modal control, optionally bound to a stable `id`. `useBaseModal(id)` returns a
 * controller scoped to one slot: `show()` mounts under that id, `hide()`/`close()` dismiss it,
 * and `isOpen` tracks it — so the id is passed once, not on every call. The single
 * `<BaseModalProvider/>` at the app root renders the shared stack.
 *
 * Closing is prop-driven: pass `onClose` in props (Vue wires it to the component's `close`
 * emit) and call `hide()` from it.
 *
 * @example
 * const {show, hide, isOpen} = useBaseModal("search")
 * show(SearchModal, {onClose: () => hide()})
 */
export const useBaseModal = createSharedComposable(
  (boundId?: string) => {
    const isOpen = computed(() => Boolean(boundId) && stack.value.some((modal) => modal.id === boundId && !modal.closing))

    function show<T extends Component>(component: T, props?: ModalComponentProps<T>, options: ModalShowOptions = {}): ModalHandle {
      const id = options.id ?? boundId ?? `modal-${++counter}`
      const item: ModalItem = {
        id,
        component: markRaw(component) as ModalComponent,
        props: (props ?? {}) as Record<string, unknown>,
        closing: false,
      }

      const index = stack.value.findIndex((modal) => modal.id === id)
      if (index >= 0) stack.value.splice(index, 1, item)
      else stack.value.push(item)

      return {id, close: () => hide(id)}
    }

    function hide(id = boundId) {
      const target = id ? stack.value.find((modal) => modal.id === id) : stack.value.at(-1)
      if (target) target.closing = true
    }

    function close() {
      hide(boundId)
    }

    function hideAll() {
      stack.value.forEach((modal) => (modal.closing = true))
    }

    function patchProps<T extends Component>(id: string, props: Partial<ModalComponentProps<T>>) {
      const item = stack.value.find((modal) => modal.id === id)
      if (item) item.props = {...item.props, ...props}
    }

    function remove(id: string) {
      const index = stack.value.findIndex((modal) => modal.id === id)
      if (index >= 0) stack.value.splice(index, 1)
    }

    return {stack, isOpen, show, hide, close, hideAll, patchProps, remove}
  },
  (boundId) => boundId ?? DEFAULT_KEY,
)
