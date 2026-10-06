import {ref} from "vue"

export type BoardFrame = "day" | "milestone"

export function useBoardFrame() {
  const frame = ref<BoardFrame>("day")

  function setFrame(next: BoardFrame) {
    frame.value = next
  }

  return {frame, setFrame}
}
