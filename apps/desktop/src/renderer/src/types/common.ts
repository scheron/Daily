import type {TaskStatus} from "@daily/protocol"

export type TasksFilter = "all" | TaskStatus
export type SettingsPanel = "general" | "projects" | "icloud" | "ai" | "deleted-tasks" | "debug" | null
