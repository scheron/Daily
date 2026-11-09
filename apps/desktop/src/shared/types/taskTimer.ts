import type {Task} from "@daily/protocol"

export type TaskTimer = {
  taskId: Task["id"]
  /** Elapsed time, including the running segment, at snapshot creation. */
  elapsedMs: number
  isRunning: boolean
}

export type TaskTimerCommand = {
  type: "start" | "pause" | "resume" | "stop" | "promote"
  taskId: Task["id"]
}
