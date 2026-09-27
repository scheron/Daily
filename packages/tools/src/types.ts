import type {IWorkStorage} from "@daily/core/storage/IWorkStorage"
import type {ActorSource, File, ISODate, ISODateTime, ISOTime, TaskScheduled, Timezone} from "@daily/protocol"

export type ToolJsonType = "string" | "number" | "integer" | "boolean" | "array" | "object" | "null"

export type ToolPropertySchema = {
  type: ToolJsonType | ToolJsonType[]
  description: string
  enum?: readonly string[]
  items?: ToolPropertySchema
  properties?: Record<string, ToolPropertySchema>
  required?: readonly string[]
  additionalProperties?: false
  minimum?: number
  maximum?: number
}

export type ToolInputSchema = {
  type: "object"
  properties: Record<string, ToolPropertySchema>
  required?: readonly string[]
  additionalProperties: false
}

/** `"delete"` is a write that is also destructive: the Assistant asks the person first, and an MCP client advertises it with `destructiveHint`. */
export type ToolMode = "read" | "write" | "delete"

/** One shared tool's clock: today, the time, and the schedule a task with no day named lands on — read from whichever host runs it. */
export type ToolClock = {
  readonly timeZone: Timezone
  today(): ISODate
  time(): ISOTime
  scheduledNow(): TaskScheduled
  dayStart(date: ISODate): ISODateTime
  dayEndExclusive(date: ISODate): ISODateTime
}

/**
 * Whether a file's bytes are present here and how to read them, plus what to do once a tool has
 * saved new ones. The server keeps its asset index through this; the desktop does nothing extra.
 */
export type ToolFilesPort = {
  isPresent(file: File): Promise<boolean>
  read(file: File): Promise<Buffer>
  /**
   * Runs `effect` — deferred until the server's snapshot write commits, run at once on the desktop
   * — and resolves once it is safe to answer the call. A caller awaits this before answering, so a
   * write that fails becomes a `ToolError` instead of an unhandled rejection.
   */
  afterSave(file: File, effect: () => Promise<void>): Promise<void>
}

/**
 * What every shared tool runs against, built the same way whether the caller is an MCP agent or
 * the Daily Assistant: the one read and write path, a clock, who is writing, and a way to reach a
 * file's bytes.
 */
export type ToolContext = {
  workStorage: IWorkStorage
  clock: ToolClock
  source: ActorSource
  files: ToolFilesPort
}

/** One tool of the shared set: what it is advertised as, and what it does when called with parsed input over the host context. */
export type Tool = {
  name: string
  description: string
  inputSchema: ToolInputSchema
  mode: ToolMode
  run(input: Record<string, unknown>, ctx: ToolContext): Promise<unknown>
}
