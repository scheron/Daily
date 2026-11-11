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
  LocalModelId,
  MigrationDirection,
  MigrationPreview,
  Milestone,
  MoveTaskByOrderParams,
  PendingAgentRequestView,
  PendingApprovalView,
  ProtocolMismatchView,
  RequestLogResult,
  ServerAgentsView,
  ServerBindingView,
  ServerConnectionStateView,
  ServerConnectionStatus,
  ServerMembershipView,
  ServerProbeView,
  SettingsView,
  Subtask,
  SubtaskCounts,
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
import type {HotkeyRebindResult, QuickTaskHotkeyState, QuickTaskMenu} from "./quickTask"
import type {TaskTimer, TaskTimerCommand} from "./taskTimer"
import type {ToastMessage} from "./toast"
import type {AppUpdateOffer, AppUpdateState, WhatsNewReleaseResult} from "./update"

export type ApprovalKind = "device" | "agent"

export type BridgeIPC = {
  invoke: (channel: string, ...args: any[]) => Promise<any>
  send: (channel: string, ...args: any[]) => void
  on: (channel: string, callback: (...args: any[]) => void) => () => void

  "window:is-visible": () => Promise<boolean>
  "window:on-visibility-changed": (callback: (visible: boolean) => void) => () => void

  "app:renderer-ready": () => void

  "toast:publish": (toast: ToastMessage) => void
  "toast:on-show": (callback: (toast: ToastMessage) => void) => () => void

  "platform:is-mac": () => boolean

  "shell:open-external": (url: string) => Promise<boolean>
  "clipboard:read-gif": () => Promise<Uint8Array<ArrayBuffer> | null>

  "storage-sync:sync": () => Promise<void>
  "storage-sync:get-status": () => Promise<SyncStatus>
  "storage-sync:get-remote-states": () => Promise<SyncRemoteState[]>
  "storage-sync:on-status-changed": (callback: (status: SyncStatus, prevStatus: SyncStatus) => void) => void
  "storage:on-changed": (callback: (changeset: Changeset) => void) => void

  "sync-server:get-state": () => Promise<ServerConnectionStateView>
  "sync-server:retry": () => Promise<void>
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
  "sync-server:get-logs": () => Promise<RequestLogResult>

  "sync-server:on-approval-requested": (callback: () => void) => void
  "sync-server:on-revoked": (callback: () => void) => void
  "sync-server:on-protocol-mismatch-changed": (callback: (mismatch: ProtocolMismatchView | null) => void) => void
  "sync-server:on-role-changed": (callback: (role: DeviceRole) => void) => void
  "sync-server:on-agent-requested": (callback: () => void) => void
  "sync-server:on-approval-resolved": (callback: (kind: ApprovalKind) => void) => void
  "sync-server:on-agents-accepted-changed": (callback: (acceptsAgents: boolean) => void) => void
  "sync-server:on-connection-changed": (callback: (connection: ServerConnectionStatus) => void) => void

  "sync-provider:preview": (target: Exclude<SyncProvider, "off">) => Promise<MigrationPreview>
  "sync-provider:migrate": (target: SyncProvider, direction: MigrationDirection | null) => Promise<void>

  "settings:load": () => Promise<SettingsView>
  "settings:save": (settings: Partial<SettingsView>) => Promise<void>
  "settings:on-changed": (callback: () => void) => void

  "updates:get-state": () => Promise<AppUpdateState>
  "updates:download": (offer: AppUpdateOffer) => Promise<boolean>
  "updates:on-state-changed": (callback: (state: AppUpdateState) => void) => () => void
  "whats-new:get-release": () => Promise<WhatsNewReleaseResult>
  "whats-new:mark-shown": (version: string) => Promise<boolean>

  "activity:get-by-task": (taskId: Task["id"]) => Promise<TaskEvent[]>

  "quick-task:hide": () => void
  "quick-task:resize": (height: number) => void
  "quick-task:active-hotkey": () => Promise<QuickTaskHotkeyState>
  "quick-task:rebind-hotkey": (accelerator: string) => Promise<HotkeyRebindResult>
  "quick-task:on-shown": (callback: () => void) => () => void
  "quick-task:set-menu": (menu: QuickTaskMenu | null) => void
  "quick-task:on-menu-pick": (callback: (index: number) => void) => () => void
  "quick-task-menu:on-menu": (callback: (menu: QuickTaskMenu | null) => void) => () => void
  "quick-task-menu:resize": (height: number) => void
  "quick-task-menu:pick": (index: number) => void

  "task-timers:get": () => Promise<TaskTimer[]>
  "task-timers:dispatch": (command: TaskTimerCommand) => Promise<boolean>
  "task-timers:on-changed": (callback: (timers: TaskTimer[]) => void) => () => void

  "tasks:get-all": () => Promise<Task[]>
  "tasks:get-one": (id: Task["id"]) => Promise<Task | null>
  "tasks:update": (id: Task["id"], updates: PartialDeep<Task>, spentTimeDelta?: number) => Promise<Changeset>
  "tasks:create": (
    task: Omit<Task, "id" | "createdAt" | "updatedAt" | "deletedAt" | "branchId"> & {branchId?: Task["branchId"]; id?: Task["id"]},
  ) => Promise<Changeset>
  "tasks:move-by-order": (params: MoveTaskByOrderParams) => Promise<Changeset>
  "tasks:move-to-branch": (taskId: Task["id"], branchId: Branch["id"]) => Promise<Changeset>
  "tasks:delete": (id: Task["id"]) => Promise<Changeset>
  "tasks:get-deleted": (params?: {limit?: number; branchId?: Branch["id"]}) => Promise<Task[]>
  "tasks:restore": (id: Task["id"]) => Promise<Changeset>
  "tasks:delete-permanently": (id: Task["id"]) => Promise<boolean>
  "tasks:delete-all-permanently": () => Promise<number>

  "relations:get-all": () => Promise<TaskRelation[]>
  "relations:set": (taskId: Task["id"], next: TaskRelationSets) => Promise<Changeset>

  "comments:get-by-task": (taskId: Task["id"]) => Promise<TaskComment[]>
  "comments:get-counts": () => Promise<TaskCommentCounts>
  "comments:create": (taskId: Task["id"], content: string) => Promise<Changeset>
  "comments:update": (id: TaskComment["id"], content: string) => Promise<Changeset>
  "comments:delete": (id: TaskComment["id"]) => Promise<Changeset>
  "subtasks:get-by-task": (taskId: Task["id"]) => Promise<Subtask[]>
  "subtasks:get-counts": () => Promise<SubtaskCounts>
  "subtasks:create": (taskId: Task["id"], content: string) => Promise<Changeset>
  "subtasks:update": (id: Subtask["id"], updates: {content?: string; done?: boolean}) => Promise<Changeset>
  "subtasks:delete": (id: Subtask["id"]) => Promise<Changeset>
  "subtasks:make-task": (id: Subtask["id"]) => Promise<Task | null>

  "branches:get-many": () => Promise<Branch[]>
  "branches:create": (branch: Omit<Branch, "id" | "createdAt" | "updatedAt" | "deletedAt">) => Promise<Branch | null>
  "branches:update": (id: Branch["id"], updates: Partial<Pick<Branch, "name" | "description" | "emoji">>) => Promise<Branch | null>
  "branches:delete": (id: Branch["id"]) => Promise<boolean>
  "branches:set-active": (id: Branch["id"]) => Promise<void>

  "search:query": (query: string) => Promise<TaskSearchResult[]>

  "tags:get-many": () => Promise<Tag[]>
  "tags:create": (tag: Omit<Tag, "id" | "createdAt" | "updatedAt" | "deletedAt">) => Promise<Tag | null>
  "tags:delete": (id: Tag["id"]) => Promise<boolean>

  "milestones:get-many": (branchId?: Branch["id"]) => Promise<Milestone[]>
  "milestones:create": (milestone: Omit<Milestone, "id" | "createdAt" | "updatedAt" | "orderIndex">) => Promise<Changeset>
  "milestones:update": (
    id: Milestone["id"],
    updates: Partial<Pick<Milestone, "name" | "description" | "targetDate" | "orderIndex">>,
  ) => Promise<Changeset>
  "milestones:delete": (id: Milestone["id"]) => Promise<Changeset>

  "files:save": (filename: string, data: Buffer) => Promise<File["id"]>
  "files:get-path": (id: File["id"]) => Promise<string>

  "ai:check-connection": () => Promise<boolean>
  "ai:list-models": () => Promise<string[]>
  "ai:send-message": (message: string) => Promise<AIResponse>
  "ai:cancel": () => Promise<boolean>
  "ai:clear-history": () => Promise<boolean>
  "ai:update-config": (config: Partial<AIConfig>) => Promise<boolean>
  "ai:confirm-tool-call": (confirmationId: string) => Promise<boolean>
  "ai:cancel-tool-call": (confirmationId: string) => Promise<boolean>
  "ai:get-current-session": () => Promise<{turns: AgentTurnSnapshot[]}>

  "ai:local-list-models": () => Promise<LocalModelInfo[]>
  "ai:local-download-model": (modelId: LocalModelId) => Promise<boolean>
  "ai:local-cancel-download": (modelId: LocalModelId) => Promise<boolean>
  "ai:local-delete-model": (modelId: LocalModelId) => Promise<boolean>
  "ai:local-get-state": () => Promise<LocalRuntimeState>
  "ai:local-get-disk-usage": () => Promise<{total: number; models: Record<string, number>}>
  "ai:local-refresh-catalog": () => Promise<CatalogRefreshResult>

  "ai:on-confirmation-required": (callback: (confirmation: PendingToolConfirmation) => void) => () => void
  "ai:on-confirmation-resolved": (callback: (payload: {confirmationId: string}) => void) => () => void
  "ai:on-event": (callback: (event: AIEvent) => void) => () => void

  "ai:on-local-state-changed": (callback: (state: LocalRuntimeState) => void) => void
  "ai:on-local-download-progress": (callback: (progress: LocalModelDownloadProgress) => void) => void
  "ai:on-local-catalog-changed": (callback: () => void) => void

  "shortcut:tasks:create": (callback: () => void) => void
  "shortcut:ui:open-search-panel": (callback: () => void) => void
  "shortcut:ui:calendar-dock:toggle": (callback: () => void) => void
}
