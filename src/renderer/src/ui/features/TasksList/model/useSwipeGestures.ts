import type {Ref} from "vue"

export type SwipeGesturesOptions = {
  isActive: Ref<boolean>
  minSwipeDistance: Ref<number>

  resetSwipe: () => void
  triggerSwipe: () => void
  setActive: (active: boolean) => void
  updatePosition: (deltaX: number) => void
}

export function useSwipeGestures(options: SwipeGesturesOptions) {
  const {minSwipeDistance, isActive, resetSwipe, triggerSwipe, setActive, updatePosition} = options

  let isHorizontal = false

  let isTouching = false
  let touchStartX = 0
  let touchStartY = 0

  let isDragging = false
  let startX = 0
  let startY = 0

  function onTouchStart(e: TouchEvent) {
    touchStartX = e.touches[0].clientX
    touchStartY = e.touches[0].clientY
    isTouching = true
    isHorizontal = false

    resetSwipe()
  }

  function onTouchMove(e: TouchEvent) {
    if (!isTouching) return

    const deltaX = e.touches[0].clientX - touchStartX
    const deltaY = e.touches[0].clientY - touchStartY

    if (!isHorizontal && !isActive.value) {
      if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > minSwipeDistance.value) {
        isHorizontal = true
        e.preventDefault()
      }
    }

    if (isHorizontal) {
      e.preventDefault()
      updateSwipePosition(deltaX)
    }
  }

  function onTouchEnd() {
    if (!isTouching) return
    isTouching = false
    if (isHorizontal) triggerSwipe()
    isHorizontal = false
  }

  function onMouseDown(e: MouseEvent) {
    startX = e.clientX
    startY = e.clientY
    isDragging = true
    isHorizontal = false

    resetSwipe()
  }

  function onMouseMove(e: MouseEvent) {
    if (!isDragging) return

    const deltaX = e.clientX - startX
    const deltaY = e.clientY - startY

    if (!isHorizontal && !isActive.value) {
      if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > minSwipeDistance.value) {
        isHorizontal = true
      }
    }

    if (isHorizontal) updateSwipePosition(deltaX)
  }

  function onMouseUp() {
    if (!isDragging) return

    isDragging = false
    if (isHorizontal) triggerSwipe()
    isHorizontal = false
  }

  function updateSwipePosition(deltaX: number) {
    requestAnimationFrame(() => {
      if (!isActive.value && Math.abs(deltaX) > minSwipeDistance.value) setActive(true)
      if (isActive.value) updatePosition(deltaX)
    })
  }

  return {
    onTouchStart,
    onTouchMove,
    onTouchEnd,
    onMouseDown,
    onMouseMove,
    onMouseUp,
  }
}
