import {computed, onBeforeUnmount, shallowRef} from "vue"
import {useEventListener} from "@vueuse/core"

import {useTasksStore} from "@/stores/tasks"
import {useBaseModal} from "@/ui/base/BaseModal"
import {autoUpdate, flip, hide, offset, shift, useFloating} from "@floating-ui/vue"

import type {Task} from "@daily/protocol"
import type {Ref} from "vue"

export function useTaskRelationPreview(detailsRef: Readonly<Ref<HTMLElement | null>>, previewRef: Readonly<Ref<HTMLElement | null>>) {
  const gutter = 8
  let pendingAnchor: HTMLElement | null = null
  let showTimer: number | undefined
  let hideTimer: number | undefined

  const tasksStore = useTasksStore()
  const {stack: modals} = useBaseModal()
  const active = shallowRef<{taskId: Task["id"]; anchor: HTMLElement} | null>(null)

  const anchor = computed(() => active.value?.anchor ?? null)
  const previewTask = computed(() => (active.value ? tasksStore.findTaskById(active.value.taskId) : null))

  const {floatingStyles, isPositioned, middlewareData} = useFloating(anchor, previewRef, {
    open: computed(() => active.value !== null),
    strategy: "fixed",
    placement: "left",
    middleware: [
      offset(({placement, rects}) => {
        const panel = detailsRef.value?.getBoundingClientRect()
        if (placement !== "left" || !panel || panel.left < rects.floating.width + gutter * 2) return gutter
        return rects.reference.x - panel.left + gutter
      }),
      flip({crossAxis: false, fallbackPlacements: ["top", "bottom", "right"], padding: gutter}),
      shift({padding: gutter}),
      hide(),
    ],
    whileElementsMounted: autoUpdate,
  })

  const isPreviewVisible = computed(() => !!previewTask.value && isPositioned.value && !middlewareData.value.hide?.referenceHidden)

  function showPreview(taskId: Task["id"], event: PointerEvent | FocusEvent) {
    const target = event.currentTarget
    if (!(target instanceof HTMLElement)) return
    if (event instanceof PointerEvent && event.pointerType === "touch") return
    if (event.type === "focus" && !target.matches(":focus-visible")) return

    cancelShow()
    if (anchor.value === target) {
      holdPreview()
      return
    }

    if (event.type === "focus") {
      holdPreview()
      active.value = {taskId, anchor: target}
      return
    }

    if (active.value) scheduleHide()
    pendingAnchor = target
    showTimer = window.setTimeout(() => {
      pendingAnchor = null
      holdPreview()
      if (target.isConnected) active.value = {taskId, anchor: target}
    }, 350)
  }

  function leavePreview(event: PointerEvent | FocusEvent) {
    if (event.currentTarget === pendingAnchor) cancelShow()
    if (event.currentTarget === anchor.value) scheduleHide()
  }

  function holdPreview() {
    window.clearTimeout(hideTimer)
  }

  function scheduleHide() {
    holdPreview()
    hideTimer = window.setTimeout(() => {
      active.value = null
    }, 300)
  }

  function hidePreview() {
    cancelShow()
    holdPreview()
    active.value = null
  }

  function cancelShow() {
    window.clearTimeout(showTimer)
    pendingAnchor = null
  }

  useEventListener(document, "keydown", (event) => {
    if (event.key !== "Escape" || event.defaultPrevented || modals.value.length > 0) return
    if (isPreviewVisible.value) event.preventDefault()
    hidePreview()
  })

  useEventListener(document, "pointerdown", (event) => {
    if (!(event.target instanceof Node) || !previewRef.value?.contains(event.target)) hidePreview()
  })

  onBeforeUnmount(hidePreview)

  return {previewTask, isPreviewVisible, floatingStyles, showPreview, leavePreview, holdPreview, scheduleHide, hidePreview}
}
