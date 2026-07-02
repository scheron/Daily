import type {TaskStatus} from "@shared/types/storage"

export type TasksFilter = "all" | TaskStatus
export type SettingsPanel = "general" | "workflow" | "icloud" | "ai" | "debug" | null
