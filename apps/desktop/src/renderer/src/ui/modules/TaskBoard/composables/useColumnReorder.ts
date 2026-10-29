import {computed, nextTick, onBeforeUnmount, ref, shallowRef, watch} from "vue"
import {useEventListener} from "@vueuse/core"
import {storeToRefs} from "pinia"

import {useDragAutoScroll} from "@/composables/tasks/useDragAutoScroll"
import {useSettingValue} from "@/composables/useSettingValue"
import {TASK_COLUMNS} from "@/constants/ui"
import {useDragDropStore} from "@/stores/dragDrop.store"
import {useFilterStore} from "@/stores/filter.store"
import {useSettingsStore} from "@/stores/settings.store"
import {useTasksStore} from "@/stores/tasks"

import type {TaskStatus} from "@daily/protocol"
import type {ShallowRef} from "vue"

export function useColumnReorder(boardRef: Readonly<ShallowRef<HTMLElement | null>>) {
  let resizeObserver: ResizeObserver | null = null
  let suppressClick = false
  let previousCursor = ""
  let previousUserSelect = ""
  let revision = 0
  let pendingScroll: Map<HTMLElement, {top: number; left: number}> | null = null
  const animations = new Map<HTMLElement, Animation>()

  const {settings} = storeToRefs(useSettingsStore())
  const {frame, activeMilestoneId, isNoMilestoneActive} = storeToRefs(useFilterStore())
  const {activeDay} = storeToRefs(useTasksStore())
  const {draggingTaskId} = storeToRefs(useDragDropStore())

  const gesture = shallowRef<{
    status: TaskStatus
    pointerId: number
    startX: number
    startY: number
    offsetX: number
    originalScrollLeft: number
    origin: number
    pointerX: number
    boardRect: DOMRect
    fullOrder: TaskStatus[]
    visibleOrder: TaskStatus[]
    measurements: Map<TaskStatus, {width: number; height: number}>
    thresholds: number[]
    slot: number
  } | null>(null)
  const draggingStatus = ref<TaskStatus | null>(null)
  const previewOrder = shallowRef<TaskStatus[] | null>(null)
  const previewPosition = shallowRef({x: 0, y: 0})

  const viewContext = computed(() =>
    JSON.stringify([
      settings.value?.branch,
      settings.value?.appearance?.boardMode,
      settings.value?.appearance?.taskView,
      settings.value?.typography,
      settings.value?.layout?.sectionsCollapsed,
      frame.value,
      activeMilestoneId.value,
      isNoMilestoneActive.value,
      activeDay.value,
    ]),
  )

  const columnOrder = useSettingValue(
    "layout.columnOrder",
    TASK_COLUMNS.map((column) => column.status),
  )
  const autoScroll = useDragAutoScroll("x")

  useEventListener(boardRef, "pointerdown", onPointerDown)
  useEventListener(boardRef, "click", onClick, {capture: true})
  useEventListener(boardRef, "scroll", updateDestination)
  useEventListener(boardRef, "dragstart", onDragStart)
  useEventListener(window, "pointermove", onPointerMove, {passive: false})
  useEventListener(window, "pointerup", onPointerUp)
  useEventListener(window, "pointercancel", onPointerCancel)
  useEventListener(window, "keydown", onKeyDown)
  useEventListener(window, "resize", () => reset())
  useEventListener(window, "blur", () => reset())

  function onPointerDown(event: PointerEvent) {
    if (event.button !== 0 || gesture.value || draggingTaskId.value || !(event.target instanceof Element)) return
    const handle = event.target.closest("[data-column-drag-handle]")
    const column = handle?.closest<HTMLElement>("[data-column-status]")
    const board = boardRef.value
    if (!column || !board?.contains(column)) return
    suppressClick = false
    const rect = column.getBoundingClientRect()
    const elements = getColumns()
    const visibleOrder = elements.map((element) => element.dataset.columnStatus as TaskStatus)
    const status = column.dataset.columnStatus as TaskStatus
    const statuses = TASK_COLUMNS.map((item) => item.status)
    const saved = Array.isArray(columnOrder.value) ? columnOrder.value : []
    const measurements = new Map(
      elements.map((element) => {
        const {width, height} = element.getBoundingClientRect()
        return [element.dataset.columnStatus as TaskStatus, {width, height}]
      }),
    )
    let slotLeft = 0
    const thresholds = elements
      .filter((element) => element !== column)
      .map((element) => {
        const width = measurements.get(element.dataset.columnStatus as TaskStatus)!.width
        const threshold = slotLeft + width / 2
        const next = element.nextElementSibling
        slotLeft += width + (next && !next.hasAttribute("data-column-status") ? next.getBoundingClientRect().width : 0)
        return threshold
      })
    gesture.value = {
      status,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      offsetX: event.clientX - rect.left,
      originalScrollLeft: board.scrollLeft,
      origin: elements[0].getBoundingClientRect().left + board.scrollLeft,
      pointerX: event.clientX,
      boardRect: board.getBoundingClientRect(),
      fullOrder: [...new Set([...saved.filter((item) => statuses.includes(item)), ...statuses])],
      visibleOrder,
      measurements,
      thresholds,
      slot: visibleOrder.indexOf(status),
    }
    observeGeometry()
  }

  function onPointerMove(event: PointerEvent) {
    const current = gesture.value
    if (!current || event.pointerId !== current.pointerId || !checkGeometry()) return
    if (!draggingStatus.value && Math.hypot(event.clientX - current.startX, event.clientY - current.startY) < 6) return
    event.preventDefault()
    if (!draggingStatus.value) {
      previousCursor = document.body.style.cursor
      previousUserSelect = document.body.style.userSelect
      document.body.style.cursor = "grabbing"
      document.body.style.userSelect = "none"
      draggingStatus.value = current.status
    }
    current.pointerX = event.clientX
    previewPosition.value = {x: event.clientX, y: event.clientY}
    updateDestination()
    autoScroll.update(boardRef.value, event.clientX)
  }

  function updateDestination() {
    const current = gesture.value
    if (!current || !draggingStatus.value || !checkGeometry()) return
    const left = current.pointerX - current.offsetX + boardRef.value!.scrollLeft - current.origin
    const deadband = 4
    let slot = current.slot
    while (slot < current.thresholds.length && left > current.thresholds[slot] + deadband) slot++
    while (slot > 0 && left < current.thresholds[slot - 1] - deadband) slot--
    if (slot === current.slot) return
    current.slot = slot
    const next = current.visibleOrder.filter((status) => status !== current.status)
    next.splice(slot, 0, current.status)
    const positions = new Map(getColumns().map((element) => [element, element.getBoundingClientRect().left]))
    stopAnimations()
    setPreviewOrder(next)
    const update = ++revision
    void nextTick(() => {
      if (gesture.value !== current || update !== revision) return
      for (const element of getColumns()) {
        const delta = (positions.get(element) ?? element.getBoundingClientRect().left) - element.getBoundingClientRect().left
        if (Math.abs(delta) < 0.5) continue
        const animation = element.animate([{transform: `translateX(${delta}px)`}, {transform: "translateX(0)"}], {
          duration: 180,
          easing: "cubic-bezier(0.16, 1, 0.3, 1)",
        })
        animations.set(element, animation)
        animation.onfinish = () => {
          if (animations.get(element) === animation) animations.delete(element)
        }
      }
    })
  }

  function onPointerUp(event: PointerEvent) {
    const current = gesture.value
    if (!current || event.pointerId !== current.pointerId || !checkGeometry()) return
    const rect = boardRef.value!.getBoundingClientRect()
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) {
      reset()
      return
    }
    current.pointerX = event.clientX
    updateDestination()
    const nextVisible = previewOrder.value
    if (draggingStatus.value && nextVisible?.some((status, index) => status !== current.visibleOrder[index])) {
      const next = current.fullOrder.filter((status) => status !== current.status)
      const target = nextVisible[current.slot === 0 ? 1 : current.slot - 1]
      next.splice(next.indexOf(target) + (current.slot === 0 ? 0 : 1), 0, current.status)
      reset(current.status)
      columnOrder.value = next
      return
    }
    reset()
  }

  function setPreviewOrder(order: TaskStatus[] | null) {
    if (previewOrder.value !== order)
      updateColumns(() => {
        previewOrder.value = order
      })
  }

  function updateColumns(change: () => void) {
    const board = boardRef.value
    if (!board) {
      change()
      return
    }
    const scroll = pendingScroll ?? new Map<HTMLElement, {top: number; left: number}>()
    for (const column of getColumns()) {
      for (const element of [column, ...Array.from(column.querySelectorAll<HTMLElement>("[data-column-list]"))]) {
        if (!scroll.has(element)) scroll.set(element, {top: element.scrollTop, left: element.scrollLeft})
      }
    }
    const scheduled = pendingScroll === scroll
    pendingScroll = scroll
    change()
    if (scheduled) return
    void nextTick(() => {
      if (pendingScroll !== scroll || boardRef.value !== board) return
      pendingScroll = null
      for (const [element, position] of scroll) {
        if (!element.isConnected || !board.contains(element)) continue
        if (element.scrollTop === position.top && element.scrollLeft === position.left) continue
        element.scrollTop = position.top
        element.scrollLeft = position.left
        element.dispatchEvent(new Event("scroll"))
      }
    })
  }

  function stopAnimations() {
    for (const animation of animations.values()) animation.cancel()
    animations.clear()
  }

  function reset(revealStatus: TaskStatus | null = null) {
    const current = gesture.value
    if (!current) return
    const board = boardRef.value
    resizeObserver?.disconnect()
    resizeObserver = null
    autoScroll.stop()
    stopAnimations()
    const update = ++revision
    if (draggingStatus.value) {
      suppressClick = true
      document.body.style.cursor = previousCursor
      document.body.style.userSelect = previousUserSelect
    }
    updateColumns(() => {
      draggingStatus.value = null
      previewOrder.value = null
    })
    gesture.value = null
    void nextTick(() => {
      if (!board || boardRef.value !== board || revision !== update) return
      board.scrollLeft = current.originalScrollLeft
      if (!revealStatus) return
      const source = getColumns().find((column) => column.dataset.columnStatus === revealStatus)
      if (!source) return
      const rect = source.getBoundingClientRect()
      const bounds = board.getBoundingClientRect()
      if (rect.left < bounds.left) board.scrollLeft += rect.left - bounds.left
      else if (rect.right > bounds.right) board.scrollLeft += Math.min(rect.right - bounds.right, rect.left - bounds.left)
    })
  }

  function onClick(event: MouseEvent) {
    if (event.detail === 0 || !suppressClick || !(event.target instanceof Element) || !event.target.closest("[data-column-drag-handle]")) return
    suppressClick = false
    event.preventDefault()
    event.stopImmediatePropagation()
  }

  function onDragStart(event: DragEvent) {
    if (gesture.value) event.preventDefault()
  }

  function onPointerCancel(event: PointerEvent) {
    if (event.pointerId === gesture.value?.pointerId) reset()
  }

  function onKeyDown(event: KeyboardEvent) {
    if (event.key === "Escape" && gesture.value) {
      event.preventDefault()
      reset()
    }
  }

  function getColumns() {
    return Array.from(boardRef.value?.querySelectorAll<HTMLElement>("[data-column-status]") ?? [])
  }

  function observeGeometry() {
    const board = boardRef.value
    if (!board) return
    resizeObserver = new ResizeObserver(checkGeometry)
    resizeObserver.observe(board)
    for (const column of getColumns()) resizeObserver.observe(column)
  }

  function checkGeometry() {
    const current = gesture.value
    const board = boardRef.value
    if (!current || !board) return false
    const rect = board.getBoundingClientRect()
    const columns = getColumns()
    if (
      rect.left === current.boardRect.left &&
      rect.top === current.boardRect.top &&
      rect.width === current.boardRect.width &&
      rect.height === current.boardRect.height &&
      columns.length === current.measurements.size &&
      columns.every((column) => {
        const original = current.measurements.get(column.dataset.columnStatus as TaskStatus)
        const measured = column.getBoundingClientRect()
        return original && Math.abs(original.width - measured.width) <= 1 && original.height === measured.height
      })
    )
      return true
    reset()
    return false
  }

  watch(
    [viewContext, draggingTaskId, boardRef],
    () => {
      reset()
      pendingScroll = null
    },
    {flush: "sync"},
  )
  watch(columnOrder, () => reset(), {flush: "sync"})

  onBeforeUnmount(() => {
    reset()
    pendingScroll = null
  })

  return {draggingStatus, previewOrder, previewPosition}
}
