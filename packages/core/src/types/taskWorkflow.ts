import type {TaskScheduled} from "@daily/protocol"

export type TaskWorkflowHost = {runtimeId: string; now?: () => number; monotonicNow?: () => number; scheduledNow?: () => TaskScheduled}
