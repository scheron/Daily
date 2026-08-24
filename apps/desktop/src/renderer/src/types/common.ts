import type {TaskStatus} from "@daily/protocol"

export type TasksFilter = "all" | TaskStatus
export type SettingsPanel = "general" | "workflow" | "icloud" | "ai" | "debug" | null
