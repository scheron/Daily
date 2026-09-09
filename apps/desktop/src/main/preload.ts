import {contextBridge, ipcRenderer} from "electron"

import {SHORTCUTS_MAP} from "@shared/constants/shortcuts"

import type {
  AIConfig,
  Branch,
  Day,
  DeviceRole,
  EnrollmentPollView,
  EnrollmentTicketView,
  EnrollmentWindowView,
  ISODate,
  LocalModelId,
  MigrationDirection,
  MigrationPreview,
  PendingApprovalView,
  ProtocolMismatchView,
  ServerBindingView,
  ServerConnectionStateView,
  ServerMembershipView,
  ServerProbeView,
  SettingsView,
  StatsAggregate,
  StatsPeriod,
  SyncProvider,
  SyncRemoteState,
  SyncStatus,
  Tag,
  Task,
  TaskEvent,
  TaskSearchResult,
} from "@daily/protocol"
import type {
  AgentTurnSnapshot,
  AIEvent,
  AIResponse,
  CatalogRefreshResult,
  LocalModelDownloadProgress,
  LocalModelInfo,
  LocalRuntimeState,
  PendingToolConfirmation,
} from "@shared/types/ai"
import type {BridgeIPC} from "@shared/types/ipc"
import type {AppUpdateState} from "@shared/types/update"
import type {PartialDeep} from "type-fest"

// prettier-ignore
contextBridge.exposeInMainWorld("BridgeIPC", {
  invoke: (channel: string, ...args: any[]) => ipcRenderer.invoke(channel, ...args),
  send: (channel: string, ...args: any[]) => ipcRenderer.send(channel, ...args),
  on: (channel: string, callback: (...args: any[]) => void) => {
    const subscription = (_event: any, ...args: any[]) => callback(...args)
    ipcRenderer.on(channel, subscription)
    return () => ipcRenderer.removeListener(channel, subscription)
  },

  "window:minimize": () => ipcRenderer.send("window:minimize"),
  "window:maximize": () => ipcRenderer.send("window:maximize"),
  "window:close": () => ipcRenderer.send("window:close"),

  "platform:is-mac": () => process.platform === "darwin",
  "platform:is-windows": () => process.platform === "win32",
  "platform:is-linux": () => process.platform === "linux",

  "shell:open-external": (url: string) => ipcRenderer.invoke("shell:open-external", url) as Promise<boolean>,

  "storage-sync:sync": () => ipcRenderer.invoke("storage-sync:sync") as Promise<void>,
  "storage-sync:get-status": () => ipcRenderer.invoke("storage-sync:get-status") as Promise<SyncStatus>,
  "storage-sync:get-remote-states": () => ipcRenderer.invoke("storage-sync:get-remote-states") as Promise<SyncRemoteState[]>,
  "storage-sync:on-status-changed": (callback: (status: SyncStatus, prevStatus: SyncStatus) => void) => ipcRenderer.on("storage-sync:status-changed", (_event, status: SyncStatus, prevStatus: SyncStatus) => callback(status, prevStatus)),
  "storage-sync:on-data-changed": (callback: () => void) => ipcRenderer.on("storage-sync:data-changed", (_event, ) => callback()),

  "sync-server:get-state": () => ipcRenderer.invoke("sync-server:get-state") as Promise<ServerConnectionStateView>,
  "sync-server:default-device-name": () => ipcRenderer.invoke("sync-server:default-device-name") as Promise<string>,
  "sync-server:probe": (baseUrl: string) => ipcRenderer.invoke("sync-server:probe", baseUrl) as Promise<ServerProbeView>,
  "sync-server:claim": (code: string, deviceName: string, confirmInsecure: boolean) => ipcRenderer.invoke("sync-server:claim", code, deviceName, confirmInsecure) as Promise<ServerBindingView>,
  "sync-server:request-enrollment": (deviceName: string, confirmInsecure: boolean) => ipcRenderer.invoke("sync-server:request-enrollment", deviceName, confirmInsecure) as Promise<EnrollmentTicketView>,
  "sync-server:poll-enrollment": () => ipcRenderer.invoke("sync-server:poll-enrollment") as Promise<EnrollmentPollView>,
  "sync-server:cancel-connection": () => ipcRenderer.invoke("sync-server:cancel-connection") as Promise<void>,
  "sync-server:disconnect": () => ipcRenderer.invoke("sync-server:disconnect") as Promise<void>,
  "sync-server:get-pending-approval": () => ipcRenderer.invoke("sync-server:get-pending-approval") as Promise<PendingApprovalView | null>,
  "sync-server:approve": (requestId: string, code: string) => ipcRenderer.invoke("sync-server:approve", requestId, code) as Promise<void>,
  "sync-server:deny": (requestId: string) => ipcRenderer.invoke("sync-server:deny", requestId) as Promise<void>,
  "sync-server:list-membership": () => ipcRenderer.invoke("sync-server:list-membership") as Promise<ServerMembershipView>,
  "sync-server:revoke-device": (deviceId: string) => ipcRenderer.invoke("sync-server:revoke-device", deviceId) as Promise<ServerMembershipView>,
  "sync-server:open-enrollment-window": () => ipcRenderer.invoke("sync-server:open-enrollment-window") as Promise<EnrollmentWindowView>,
  "sync-server:close-enrollment-window": () => ipcRenderer.invoke("sync-server:close-enrollment-window") as Promise<void>,
  "sync-server:on-approval-requested": (callback: () => void) => ipcRenderer.on("sync-server:approval-requested", (_event, ) => callback()),
  "sync-server:on-revoked": (callback: () => void) => ipcRenderer.on("sync-server:revoked", (_event, ) => callback()),
  "sync-server:on-protocol-mismatch-changed": (callback: (mismatch: ProtocolMismatchView | null) => void) => ipcRenderer.on("sync-server:protocol-mismatch-changed", (_event, mismatch: ProtocolMismatchView | null) => callback(mismatch)),
  "sync-server:on-role-changed": (callback: (role: DeviceRole) => void) => ipcRenderer.on("sync-server:role-changed", (_event, role: DeviceRole) => callback(role)),

  "sync-provider:preview": (target: Exclude<SyncProvider, "off">) => ipcRenderer.invoke("sync-provider:preview", target) as Promise<MigrationPreview>,
  "sync-provider:migrate": (target: SyncProvider, direction: MigrationDirection | null) => ipcRenderer.invoke("sync-provider:migrate", target, direction) as Promise<void>,

  "settings:load": () => ipcRenderer.invoke("settings:load") as Promise<SettingsView>,
  "settings:save": (settings: Partial<SettingsView>) => ipcRenderer.invoke("settings:save", settings),
  "settings:on-changed": (callback: () => void) => ipcRenderer.on("settings:changed", () => callback()),

  "updates:get-state": () => ipcRenderer.invoke("updates:get-state") as Promise<AppUpdateState>,
  "updates:check": () => ipcRenderer.invoke("updates:check") as Promise<AppUpdateState>,
  "updates:download": () => ipcRenderer.invoke("updates:download") as Promise<boolean>,
  "updates:install": () => ipcRenderer.invoke("updates:install") as Promise<boolean>,
  "updates:on-state-changed": (callback: (state: AppUpdateState) => void) => {
    const subscription = (_event: unknown, state: AppUpdateState) => callback(state)
    ipcRenderer.on("updates:state-changed", subscription)
    return () => ipcRenderer.removeListener("updates:state-changed", subscription)
  },

  "days:get-many": (params?: {from?: ISODate; to?: ISODate; branchId?: Branch["id"]}) => ipcRenderer.invoke("days:get-many", params) as Promise<Day[]>,
  "days:get-one": (date: ISODate) => ipcRenderer.invoke("days:get-one", date) as Promise<Day | null>,
  "activity:get-by-day": (date: ISODate, branchId?: Branch["id"]) => ipcRenderer.invoke("activity:get-by-day", date, branchId) as Promise<TaskEvent[]>,
  "activity:get-by-task": (taskId: Task["id"]) => ipcRenderer.invoke("activity:get-by-task", taskId) as Promise<TaskEvent[]>,
  "stats:get": (period: StatsPeriod, anchor: ISODate, branchId?: Branch["id"]) => ipcRenderer.invoke("stats:get", period, anchor, branchId) as Promise<StatsAggregate>,

  "tasks:get-many": (params?: {from?: ISODate; to?: ISODate; limit?: number; branchId?: Branch["id"]}) => ipcRenderer.invoke("tasks:get-many", params) as Promise<Task[]>,
  "tasks:get-one": (id: Task["id"]) => ipcRenderer.invoke("tasks:get-one", id) as Promise<Task | null>,
  "tasks:update": (id: Task["id"], updates: PartialDeep<Task>) => ipcRenderer.invoke("tasks:update", id, updates),
  "tasks:toggle-minimized": (id: Task["id"], minimized: boolean) => ipcRenderer.invoke("tasks:toggle-minimized", id, minimized) as Promise<Task | null>,
  "tasks:create": (task: Omit<Task, "id" | "createdAt" | "updatedAt" | "deletedAt" | "attachments" | "branchId"> & {branchId?: Task["branchId"]}) =>
    ipcRenderer.invoke("tasks:create", task),
  "tasks:move-by-order": (params) => ipcRenderer.invoke("tasks:move-by-order", params) as Promise<Task | null>,
  "tasks:move-to-branch": (taskId: Task["id"], branchId: Branch["id"]) => ipcRenderer.invoke("tasks:move-to-branch", taskId, branchId) as Promise<boolean>,
  "tasks:delete": (id: Task["id"]) => ipcRenderer.invoke("tasks:delete", id),
  "tasks:add-tags": (taskId: Task["id"], tagIds: Tag["id"][]) => ipcRenderer.invoke("tasks:add-tags", taskId, tagIds),
  "tasks:remove-tags": (taskId: Task["id"], tagIds: Tag["id"][]) => ipcRenderer.invoke("tasks:remove-tags", taskId, tagIds),
  "tasks:get-deleted": (params?: {limit?: number; branchId?: Branch["id"]}) => ipcRenderer.invoke("tasks:get-deleted", params) as Promise<Task[]>,
  "tasks:restore": (id: Task["id"]) => ipcRenderer.invoke("tasks:restore", id) as Promise<Task | null>,
  "tasks:delete-permanently": (id: Task["id"]) => ipcRenderer.invoke("tasks:delete-permanently", id) as Promise<boolean>,
  "tasks:delete-all-permanently": () => ipcRenderer.invoke("tasks:delete-all-permanently") as Promise<number>,

  "branches:get-many": () => ipcRenderer.invoke("branches:get-many") as Promise<Branch[]>,
  "branches:get-one": (id: Branch["id"]) => ipcRenderer.invoke("branches:get-one", id) as Promise<Branch | null>,
  "branches:create": (branch: Omit<Branch, "id" | "createdAt" | "updatedAt" | "deletedAt">) => ipcRenderer.invoke("branches:create", branch),
  "branches:update": (id: Branch["id"], updates: Pick<Branch, "name">) => ipcRenderer.invoke("branches:update", id, updates),
  "branches:delete": (id: Branch["id"]) => ipcRenderer.invoke("branches:delete", id),
  "branches:set-active": (id: Branch["id"]) => ipcRenderer.invoke("branches:set-active", id),

  "search:query": (query: string) => ipcRenderer.invoke("search:query", query) as Promise<TaskSearchResult[]>,

  "tags:get-many": () => ipcRenderer.invoke("tags:get-many") as Promise<Tag[]>,
  "tags:get-one": (id: Tag["id"]) => ipcRenderer.invoke("tags:get-one", id) as Promise<Tag | null>,
  "tags:update": (id: Tag["id"], updates: Partial<Tag>) => ipcRenderer.invoke("tags:update", id, updates),
  "tags:create": (tag: Omit<Tag, "id" | "createdAt" | "updatedAt" | "deletedAt">) => ipcRenderer.invoke("tags:create", tag),
  "tags:delete": (id: Tag["id"]) => ipcRenderer.invoke("tags:delete", id),

  "files:save": (filename: string, data: Buffer) => ipcRenderer.invoke("files:save", filename, data),
  "files:delete": (filename: string) => ipcRenderer.invoke("files:delete", filename),
  "files:get-path": (id: string) => ipcRenderer.invoke("files:get-path", id) as Promise<string>,

  "ai:check-connection": () => ipcRenderer.invoke("ai:check-connection") as Promise<boolean>,
  "ai:list-models": () => ipcRenderer.invoke("ai:list-models") as Promise<string[]>,
  "ai:send-message": (message: string) => ipcRenderer.invoke("ai:send-message", message) as Promise<AIResponse>,
  "ai:cancel": () => ipcRenderer.invoke("ai:cancel") as Promise<boolean>,
  "ai:clear-history": () => ipcRenderer.invoke("ai:clear-history") as Promise<boolean>,
  "ai:update-config": (config: Partial<AIConfig>) => ipcRenderer.invoke("ai:update-config", config) as Promise<boolean>,
  "ai:confirm-tool-call": (confirmationId: string) => ipcRenderer.invoke("ai:confirm-tool-call", confirmationId) as Promise<boolean>,
  "ai:cancel-tool-call": (confirmationId: string) => ipcRenderer.invoke("ai:cancel-tool-call", confirmationId) as Promise<boolean>,
  "ai:get-current-session": () => ipcRenderer.invoke("ai:get-current-session") as Promise<{turns: AgentTurnSnapshot[]}>,

  "ai:local-list-models": () => ipcRenderer.invoke("ai:local-list-models") as Promise<LocalModelInfo[]>,
  "ai:local-download-model": (modelId: LocalModelId) => ipcRenderer.invoke("ai:local-download-model", modelId) as Promise<boolean>,
  "ai:local-cancel-download": (modelId: LocalModelId) => ipcRenderer.invoke("ai:local-cancel-download", modelId) as Promise<boolean>,
  "ai:local-delete-model": (modelId: LocalModelId) => ipcRenderer.invoke("ai:local-delete-model", modelId) as Promise<boolean>,
  "ai:local-get-state": () => ipcRenderer.invoke("ai:local-get-state") as Promise<LocalRuntimeState>,
  "ai:local-get-disk-usage": () => ipcRenderer.invoke("ai:local-get-disk-usage") as Promise<{total: number; models: Record<string, number>}>,
  "ai:local-refresh-catalog": () => ipcRenderer.invoke("ai:local-refresh-catalog") as Promise<CatalogRefreshResult>,

  "ai:on-local-state-changed": (callback: (state: LocalRuntimeState) => void) => ipcRenderer.on("ai:local-state-changed", (_event, state: LocalRuntimeState) => callback(state)),
  "ai:on-local-download-progress": (callback: (progress: LocalModelDownloadProgress) => void) => ipcRenderer.on("ai:local-download-progress", (_event, progress: LocalModelDownloadProgress) => callback(progress)),
  "ai:on-local-catalog-changed": (callback: () => void) => ipcRenderer.on("ai:local-catalog-changed", () => callback()),

  "ai:on-confirmation-required": (callback: (confirmation: PendingToolConfirmation) => void) => {
    const subscription = (_event: unknown, confirmation: PendingToolConfirmation) => callback(confirmation)
    ipcRenderer.on("ai:confirmation-required", subscription)
    return () => ipcRenderer.removeListener("ai:confirmation-required", subscription)
  },
  "ai:on-confirmation-resolved": (callback: (payload: {confirmationId: string}) => void) => {
    const subscription = (_event: unknown, payload: {confirmationId: string}) => callback(payload)
    ipcRenderer.on("ai:confirmation-resolved", subscription)
    return () => ipcRenderer.removeListener("ai:confirmation-resolved", subscription)
  },
  "ai:on-event": (callback: (event: AIEvent) => void) => {
    const subscription = (_event: unknown, payload: AIEvent) => callback(payload)
    ipcRenderer.on("ai:event", subscription)
    return () => ipcRenderer.removeListener("ai:event", subscription)
  },

  "shortcut:tasks:create": (callback: () => void) => ipcRenderer.on(SHORTCUTS_MAP["tasks:create"].channel, () => callback()),
  "shortcut:ui:open-search-panel": (callback: () => void) => ipcRenderer.on(SHORTCUTS_MAP["ui:open-search-panel"].channel, () => callback()),
  "shortcut:ui:open-assistant-panel": (callback: () => void) => ipcRenderer.on(SHORTCUTS_MAP["ui:open-assistant-panel"].channel, () => callback()),
  "shortcut:ui:open-settings-panel": (callback: () => void) => ipcRenderer.on(SHORTCUTS_MAP["ui:open-settings-panel"].channel, () => callback()),
  "shortcut:ui:left-panel:toggle": (callback: () => void) => ipcRenderer.on(SHORTCUTS_MAP["ui:left-panel:toggle"].channel, () => callback()),
} satisfies BridgeIPC)
