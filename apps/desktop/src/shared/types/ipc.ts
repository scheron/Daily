import type {Changeset} from "@daily/core"
import type {
  AgentWindowView,
  AIConfig,
  Branch,
  DeviceRole,
  EnrollmentPollView,
  EnrollmentTicketView,
  EnrollmentWindowView,
  File,
  ISODate,
  LocalModelId,
  MigrationDirection,
  MigrationPreview,
  Milestone,
  MoveTaskByOrderParams,
  PendingAgentRequestView,
  PendingApprovalView,
  ProtocolMismatchView,
  ServerAgentsView,
  ServerBindingView,
  ServerConnectionStateView,
  ServerMembershipView,
  ServerProbeView,
  SettingsView,
  SyncProvider,
  SyncRemoteState,
  SyncStatus,
  Tag,
  Task,
  TaskComment,
  TaskCommentCounts,
  TaskEvent,
  TaskRelation,
  TaskRelationSets,
  TaskSearchResult,
} from "@daily/protocol"
import type {Buffer} from "buffer"
import type {PartialDeep} from "type-fest"
import type {
  AgentTurnSnapshot,
  AIEvent,
  AIResponse,
  CatalogRefreshResult,
  LocalModelDownloadProgress,
  LocalModelInfo,
  LocalRuntimeState,
  PendingToolConfirmation,
} from "./ai"
import type {AppUpdateState} from "./update"

export type ApprovalKind = "device" | "agent"

export interface BridgeIPC {
  // === GENERAL IPC ===
  invoke: (channel: string, ...args: any[]) => Promise<any>
  send: (channel: string, ...args: any[]) => void
  on: (channel: string, callback: (...args: any[]) => void) => () => void

  "window:minimize": () => void
  "window:maximize": () => void
  "window:close": () => void

  "app:renderer-ready": () => void

  "platform:is-mac": () => boolean
  "platform:is-windows": () => boolean
  "platform:is-linux": () => boolean

  // === SHELL ===
  "shell:open-external": (url: string) => Promise<boolean>

  // === STORAGE  ===
  "storage-sync:sync": () => Promise<void>
  "storage-sync:get-status": () => Promise<SyncStatus>
  "storage-sync:get-remote-states": () => Promise<SyncRemoteState[]>
  "storage-sync:on-status-changed": (callback: (status: SyncStatus, prevStatus: SyncStatus) => void) => void
  "storage:on-changed": (callback: (changeset: Changeset) => void) => void

  // === SELF-HOSTED DAILY SYNC SERVER ===
  "sync-server:get-state": () => Promise<ServerConnectionStateView>
  "sync-server:default-device-name": () => Promise<string>
  "sync-server:probe": (baseUrl: string) => Promise<ServerProbeView>
  "sync-server:claim": (code: string, deviceName: string, confirmInsecure: boolean) => Promise<ServerBindingView>
  "sync-server:request-enrollment": (deviceName: string, confirmInsecure: boolean) => Promise<EnrollmentTicketView>
  "sync-server:poll-enrollment": () => Promise<EnrollmentPollView>
  "sync-server:cancel-connection": () => Promise<void>
  "sync-server:disconnect": () => Promise<void>
  "sync-server:get-pending-approval": () => Promise<PendingApprovalView | null>
  "sync-server:approve": (requestId: string, code: string) => Promise<void>
  "sync-server:deny": (requestId: string) => Promise<void>
  "sync-server:list-membership": () => Promise<ServerMembershipView>
  "sync-server:revoke-device": (deviceId: string) => Promise<ServerMembershipView>
  "sync-server:open-enrollment-window": () => Promise<EnrollmentWindowView>
  "sync-server:close-enrollment-window": () => Promise<void>

  "sync-server:open-agent-window": () => Promise<AgentWindowView>
  "sync-server:close-agent-window": () => Promise<void>
  "sync-server:get-pending-agent-request": () => Promise<PendingAgentRequestView | null>
  "sync-server:approve-agent": (requestId: string, code: string) => Promise<void>
  "sync-server:deny-agent": (requestId: string) => Promise<void>
  "sync-server:list-agents": () => Promise<ServerAgentsView>
  "sync-server:revoke-agent": (agentId: string) => Promise<ServerAgentsView>

  "sync-server:on-approval-requested": (callback: () => void) => void
  "sync-server:on-revoked": (callback: () => void) => void
  "sync-server:on-protocol-mismatch-changed": (callback: (mismatch: ProtocolMismatchView | null) => void) => void
  "sync-server:on-role-changed": (callback: (role: DeviceRole) => void) => void
  "sync-server:on-agent-requested": (callback: () => void) => void
  "sync-server:on-approval-resolved": (callback: (kind: ApprovalKind) => void) => void
  "sync-server:on-agents-accepted-changed": (callback: (acceptsAgents: boolean) => void) => void

  // === SYNC PROVIDER ===
  "sync-provider:preview": (target: Exclude<SyncProvider, "off">) => Promise<MigrationPreview>
  "sync-provider:migrate": (target: SyncProvider, direction: MigrationDirection | null) => Promise<void>

  // === SETTINGS ===
  "settings:load": () => Promise<SettingsView>
  "settings:save": (settings: Partial<SettingsView>) => Promise<void>
  "settings:on-changed": (callback: () => void) => void

  // === UPDATES ===
  "updates:get-state": () => Promise<AppUpdateState>
  "updates:check": () => Promise<AppUpdateState>
  "updates:download": () => Promise<boolean>
  "updates:install": () => Promise<boolean>
  "updates:on-state-changed": (callback: (state: AppUpdateState) => void) => () => void

  "activity:get-by-task": (taskId: Task["id"]) => Promise<TaskEvent[]>

  // === TASKS  ===
  "tasks:get-all": () => Promise<Task[]>
  "tasks:get-many": (params?: {from?: ISODate; to?: ISODate; limit?: number; branchId?: Branch["id"]}) => Promise<Task[]>
  "tasks:get-one": (id: Task["id"]) => Promise<Task | null>
  "tasks:update": (id: Task["id"], updates: PartialDeep<Task>) => Promise<Changeset>
  "tasks:toggle-minimized": (id: Task["id"], minimized: boolean) => Promise<Changeset>
  "tasks:create": (
    task: Omit<Task, "id" | "createdAt" | "updatedAt" | "deletedAt" | "attachments" | "branchId"> & {branchId?: Task["branchId"]; id?: Task["id"]},
  ) => Promise<Changeset>
  "tasks:move-by-order": (params: MoveTaskByOrderParams) => Promise<Changeset>
  "tasks:move-to-branch": (taskId: Task["id"], branchId: Branch["id"]) => Promise<Changeset>
  "tasks:delete": (id: Task["id"]) => Promise<Changeset>
  "tasks:add-tags": (taskId: Task["id"], tagIds: Tag["id"][]) => Promise<Changeset>
  "tasks:remove-tags": (taskId: Task["id"], tagIds: Tag["id"][]) => Promise<Changeset>
  "tasks:get-deleted": (params?: {limit?: number; branchId?: Branch["id"]}) => Promise<Task[]>
  "tasks:restore": (id: Task["id"]) => Promise<Changeset>
  "tasks:delete-permanently": (id: Task["id"]) => Promise<boolean>
  "tasks:delete-all-permanently": () => Promise<number>

  // === RELATIONS ===
  "relations:get-all": () => Promise<TaskRelation[]>
  "relations:set": (taskId: Task["id"], next: TaskRelationSets) => Promise<Changeset>

  // === COMMENTS ===
  "comments:get-by-task": (taskId: Task["id"]) => Promise<TaskComment[]>
  "comments:get-counts": () => Promise<TaskCommentCounts>
  "comments:create": (taskId: Task["id"], content: string) => Promise<Changeset>
  "comments:update": (id: TaskComment["id"], content: string) => Promise<Changeset>
  "comments:delete": (id: TaskComment["id"]) => Promise<Changeset>

  // === BRANCHES ===
  "branches:get-many": () => Promise<Branch[]>
  "branches:get-one": (id: Branch["id"]) => Promise<Branch | null>
  "branches:create": (branch: Omit<Branch, "id" | "createdAt" | "updatedAt" | "deletedAt">) => Promise<Branch | null>
  "branches:update": (id: Branch["id"], updates: Partial<Pick<Branch, "name" | "description">>) => Promise<Branch | null>
  "branches:delete": (id: Branch["id"]) => Promise<boolean>
  "branches:set-active": (id: Branch["id"]) => Promise<void>

  // === SEARCH  ===
  "search:query": (query: string) => Promise<TaskSearchResult[]>

  // === TAGS  ===
  "tags:get-many": () => Promise<Tag[]>
  "tags:get-one": (id: Tag["id"]) => Promise<Tag | null>
  "tags:update": (id: Tag["id"], updates: Partial<Tag>) => Promise<Tag | null>
  "tags:create": (tag: Omit<Tag, "id" | "createdAt" | "updatedAt" | "deletedAt">) => Promise<Tag | null>
  "tags:delete": (id: Tag["id"]) => Promise<boolean>

  // === MILESTONES ===
  "milestones:get-many": (branchId?: Branch["id"]) => Promise<Milestone[]>
  "milestones:get-one": (id: Milestone["id"]) => Promise<Milestone | null>
  "milestones:create": (milestone: Omit<Milestone, "id" | "createdAt" | "updatedAt" | "orderIndex">) => Promise<Changeset>
  "milestones:update": (
    id: Milestone["id"],
    updates: Partial<Pick<Milestone, "name" | "description" | "targetDate" | "orderIndex">>,
  ) => Promise<Changeset>
  "milestones:delete": (id: Milestone["id"]) => Promise<Changeset>

  // === FILES ===
  "files:save": (filename: string, data: Buffer) => Promise<File["id"]>
  "files:delete": (filename: string) => Promise<boolean>
  "files:get-path": (id: File["id"]) => Promise<string>

  // === AI ===
  "ai:check-connection": () => Promise<boolean>
  "ai:list-models": () => Promise<string[]>
  "ai:send-message": (message: string) => Promise<AIResponse>
  "ai:cancel": () => Promise<boolean>
  "ai:clear-history": () => Promise<boolean>
  "ai:update-config": (config: Partial<AIConfig>) => Promise<boolean>
  "ai:confirm-tool-call": (confirmationId: string) => Promise<boolean>
  "ai:cancel-tool-call": (confirmationId: string) => Promise<boolean>
  "ai:get-current-session": () => Promise<{turns: AgentTurnSnapshot[]}>

  // === AI LOCAL MODEL MANAGEMENT ===
  "ai:local-list-models": () => Promise<LocalModelInfo[]>
  "ai:local-download-model": (modelId: LocalModelId) => Promise<boolean>
  "ai:local-cancel-download": (modelId: LocalModelId) => Promise<boolean>
  "ai:local-delete-model": (modelId: LocalModelId) => Promise<boolean>
  "ai:local-get-state": () => Promise<LocalRuntimeState>
  "ai:local-get-disk-usage": () => Promise<{total: number; models: Record<string, number>}>
  "ai:local-refresh-catalog": () => Promise<CatalogRefreshResult>

  // === AI EVENTS ===
  "ai:on-confirmation-required": (callback: (confirmation: PendingToolConfirmation) => void) => () => void
  "ai:on-confirmation-resolved": (callback: (payload: {confirmationId: string}) => void) => () => void
  "ai:on-event": (callback: (event: AIEvent) => void) => () => void

  // === AI LOCAL EVENTS ===
  "ai:on-local-state-changed": (callback: (state: LocalRuntimeState) => void) => void
  "ai:on-local-download-progress": (callback: (progress: LocalModelDownloadProgress) => void) => void
  "ai:on-local-catalog-changed": (callback: () => void) => void

  // === SHORTCUTS ===
  "shortcut:tasks:create": (callback: () => void) => void
  "shortcut:ui:open-search-panel": (callback: () => void) => void
  "shortcut:ui:open-assistant-panel": (callback: () => void) => void
  "shortcut:ui:open-settings-panel": (callback: () => void) => void
  "shortcut:ui:calendar-dock:toggle": (callback: () => void) => void
}
