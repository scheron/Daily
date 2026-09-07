const OPEN = "<think>"
const CLOSE = "</think>"
const MAX_TAG = Math.max(OPEN.length, CLOSE.length)

type EmitFn = (kind: "content" | "reasoning", text: string) => void

export class ThinkBlockSplitter {
  private buffer = ""
  private inside = false

  push(text: string, emit: EmitFn) {
    if (!text) return
    this.buffer += text
    this.drain(emit, false)
  }

  flush(emit: EmitFn) {
    this.drain(emit, true)
    if (this.buffer) {
      emit(this.inside ? "reasoning" : "content", this.buffer)
      this.buffer = ""
    }
  }

  private drain(emit: EmitFn, isFlush: boolean) {
    while (true) {
      const ltIdx = this.buffer.indexOf("<")

      if (ltIdx === -1) {
        if (this.buffer) {
          emit(this.inside ? "reasoning" : "content", this.buffer)
          this.buffer = ""
        }
        return
      }

      if (ltIdx > 0) {
        emit(this.inside ? "reasoning" : "content", this.buffer.slice(0, ltIdx))
        this.buffer = this.buffer.slice(ltIdx)
      }

      // Now buffer starts with "<". Decide what it is.
      if (this.buffer.startsWith(OPEN)) {
        this.inside = true
        this.buffer = this.buffer.slice(OPEN.length)
        continue
      }
      if (this.buffer.startsWith(CLOSE)) {
        this.inside = false
        this.buffer = this.buffer.slice(CLOSE.length)
        continue
      }

      // Could it still be a partial tag?
      const couldBePartial = !isFlush && this.buffer.length < MAX_TAG && (OPEN.startsWith(this.buffer) || CLOSE.startsWith(this.buffer))
      if (couldBePartial) {
        return // wait for more data
      }

      // It's just a lone "<" — emit it as content.
      emit(this.inside ? "reasoning" : "content", this.buffer[0])
      this.buffer = this.buffer.slice(1)
    }
  }
}
