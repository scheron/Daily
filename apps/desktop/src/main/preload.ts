import {contextBridge, ipcRenderer} from "electron"

import {SHORTCUTS_MAP} from "@shared/constants/shortcuts"
import {TOAST_PUBLISH_CHANNEL} from "@shared/constants/toast"

import type {Changeset} from "@daily/core"
import type {
  AgentWindowView,
  AIConfig,
  Branch,
  DeviceRole,
  EnrollmentPollView,
  EnrollmentTicketView,
  EnrollmentWindowView,
  LocalModelId,
  MigrationDirection,
  MigrationPreview,
  Milestone,
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
  TaskWorkflowResolution,
  WorkflowGuidanceUpdate,
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
import type {ApprovalKind, BridgeIPC} from "@shared/types/ipc"
import type {HotkeyRebindResult, QuickTaskHotkeyState, QuickTaskMenu} from "@shared/types/quickTask"
import type {TaskTimer, TaskTimerCommand} from "@shared/types/taskTimer"
import type {ToastMessage} from "@shared/types/toast"
import type {AppUpdateOffer, AppUpdateState, WhatsNewReleaseResult} from "@shared/types/update"
import type {GuidanceResult, GuidanceSaveResult, TaskWorkflowResult} from "@shared/types/workflow"
import type {PartialDeep} from "type-fest"

// prettier-ignore
contextBridge.exposeInMainWorld("BridgeIPC", {
  "workflow:get-guidance"(projectId?: string) { return ipcRenderer.invoke("workflow:get-guidance", projectId) as Promise<GuidanceResult> },
  "workflow:save-guidance"(update: WorkflowGuidanceUpdate) { return ipcRenderer.invoke("workflow:save-guidance", update) as Promise<GuidanceSaveResult> },
  "workflow:get-task"(taskId: string) { return ipcRenderer.invoke("workflow:get-task", taskId) as Promise<TaskWorkflowResult> },
  "workflow:resolve-proposal"(resolution: TaskWorkflowResolution) { return ipcRenderer.invoke("workflow:resolve-proposal", resolution) as Promise<TaskWorkflowResult> },
  invoke: (channel: string, ...args: any[]) => ipcRenderer.invoke(channel, ...args),
  send: (channel: string, ...args: any[]) => ipcRenderer.send(channel, ...args),
  on: (channel: string, callback: (...args: any[]) => void) => {
    const subscription = (_event: any, ...args: any[]) => callback(...args)
    ipcRenderer.on(channel, subscription)
    return () => ipcRenderer.removeListener(channel, subscription)
  },

  "window:is-visible": () => ipcRenderer.invoke("window:is-visible") as Promise<boolean>,
  "window:on-visibility-changed": (callback: (visible: boolean) => void) => {
    const subscription = (_event: unknown, visible: boolean) => callback(visible)
    ipcRenderer.on("window:visibility-changed", subscription)
    return () => ipcRenderer.removeListener("window:visibility-changed", subscription)
  },

  "app:renderer-ready": () => ipcRenderer.send("app:renderer-ready"),

  [TOAST_PUBLISH_CHANNEL]: (toast: ToastMessage) => ipcRenderer.send(TOAST_PUBLISH_CHANNEL, toast),
  "toast:on-show": (callback: (toast: ToastMessage) => void) => {
    const subscription = (_event: unknown, toast: ToastMessage) => callback(toast)
    ipcRenderer.on("toast:show", subscription)
    ipcRenderer.send("toast:renderer-ready")
    return () => ipcRenderer.removeListener("toast:show", subscription)
  },

  "platform:is-mac": () => process.platform === "darwin",

  "shell:open-external": (url: string) => ipcRenderer.invoke("shell:open-external", url) as Promise<boolean>,
  "clipboard:read-gif"() {
    return ipcRenderer.invoke("clipboard:read-gif") as Promise<Uint8Array<ArrayBuffer> | null>
  },

  "storage-sync:sync": () => ipcRenderer.invoke("storage-sync:sync") as Promise<void>,
  "storage-sync:get-status": () => ipcRenderer.invoke("storage-sync:get-status") as Promise<SyncStatus>,
  "storage-sync:get-remote-states": () => ipcRenderer.invoke("storage-sync:get-remote-states") as Promise<SyncRemoteState[]>,
  "storage-sync:on-status-changed": (callback: (status: SyncStatus, prevStatus: SyncStatus) => void) => ipcRenderer.on("storage-sync:status-changed", (_event, status: SyncStatus, prevStatus: SyncStatus) => callback(status, prevStatus)),
  "storage:on-changed": (callback: (changeset: Changeset) => void) => ipcRenderer.on("storage:changed", (_event, changeset: Changeset) => callback(changeset)),

  "sync-server:get-state": () => ipcRenderer.invoke("sync-server:get-state") as Promise<ServerConnectionStateView>,
  "sync-server:retry": () => ipcRenderer.invoke("sync-server:retry") as Promise<void>,
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

  "sync-server:open-agent-window": () => ipcRenderer.invoke("sync-server:open-agent-window") as Promise<AgentWindowView>,
  "sync-server:close-agent-window": () => ipcRenderer.invoke("sync-server:close-agent-window") as Promise<void>,
  "sync-server:get-pending-agent-request": () => ipcRenderer.invoke("sync-server:get-pending-agent-request") as Promise<PendingAgentRequestView | null>,
  "sync-server:approve-agent": (requestId: string, code: string) => ipcRenderer.invoke("sync-server:approve-agent", requestId, code) as Promise<void>,
  "sync-server:deny-agent": (requestId: string) => ipcRenderer.invoke("sync-server:deny-agent", requestId) as Promise<void>,
  "sync-server:list-agents": () => ipcRenderer.invoke("sync-server:list-agents") as Promise<ServerAgentsView>,
  "sync-server:revoke-agent": (agentId: string) => ipcRenderer.invoke("sync-server:revoke-agent", agentId) as Promise<ServerAgentsView>,
  "sync-server:get-logs": () => ipcRenderer.invoke("sync-server:get-logs") as Promise<RequestLogResult>,

  "sync-server:on-approval-requested": (callback: () => void) => ipcRenderer.on("sync-server:approval-requested", (_event, ) => callback()),
  "sync-server:on-revoked": (callback: () => void) => ipcRenderer.on("sync-server:revoked", (_event, ) => callback()),
  "sync-server:on-protocol-mismatch-changed": (callback: (mismatch: ProtocolMismatchView | null) => void) => ipcRenderer.on("sync-server:protocol-mismatch-changed", (_event, mismatch: ProtocolMismatchView | null) => callback(mismatch)),
  "sync-server:on-role-changed": (callback: (role: DeviceRole) => void) => ipcRenderer.on("sync-server:role-changed", (_event, role: DeviceRole) => callback(role)),
  "sync-server:on-agent-requested": (callback: () => void) => ipcRenderer.on("sync-server:agent-requested", (_event, ) => callback()),
  "sync-server:on-approval-resolved": (callback: (kind: ApprovalKind) => void) => ipcRenderer.on("sync-server:approval-resolved", (_event, kind: ApprovalKind) => callback(kind)),
  "sync-server:on-agents-accepted-changed": (callback: (acceptsAgents: boolean) => void) => ipcRenderer.on("sync-server:agents-accepted-changed", (_event, acceptsAgents: boolean) => callback(acceptsAgents)),
  "sync-server:on-connection-changed": (callback: (connection: ServerConnectionStatus) => void) => ipcRenderer.on("sync-server:connection-changed", (_event, connection: ServerConnectionStatus) => callback(connection)),

  "sync-provider:preview": (target: Exclude<SyncProvider, "off">) => ipcRenderer.invoke("sync-provider:preview", target) as Promise<MigrationPreview>,
  "sync-provider:migrate": (target: SyncProvider, direction: MigrationDirection | null) => ipcRenderer.invoke("sync-provider:migrate", target, direction) as Promise<void>,

  "settings:load": () => ipcRenderer.invoke("settings:load") as Promise<SettingsView>,
  "settings:save": (settings: Partial<SettingsView>) => ipcRenderer.invoke("settings:save", settings),
  "settings:on-changed": (callback: () => void) => ipcRenderer.on("settings:changed", () => callback()),

  "updates:get-state": () => ipcRenderer.invoke("updates:get-state") as Promise<AppUpdateState>,
  "updates:download": (offer: AppUpdateOffer) => ipcRenderer.invoke("updates:download", offer) as Promise<boolean>,
  "updates:on-state-changed": (callback: (state: AppUpdateState) => void) => {
    const subscription = (_event: unknown, state: AppUpdateState) => callback(state)
    ipcRenderer.on("updates:state-changed", subscription)
    return () => ipcRenderer.removeListener("updates:state-changed", subscription)
  },
  "whats-new:get-release"() {
    return ipcRenderer.invoke("whats-new:get-release") as Promise<WhatsNewReleaseResult>
  },
  "whats-new:mark-shown": (version: string) => ipcRenderer.invoke("whats-new:mark-shown", version) as Promise<boolean>,

  "activity:get-by-task": (taskId: Task["id"]) => ipcRenderer.invoke("activity:get-by-task", taskId) as Promise<TaskEvent[]>,

  "quick-task:hide": () => ipcRenderer.send("quick-task:hide"),
  "quick-task:resize": (height: number) => ipcRenderer.send("quick-task:resize", height),
  "quick-task:active-hotkey": () => ipcRenderer.invoke("quick-task:active-hotkey") as Promise<QuickTaskHotkeyState>,
  "quick-task:rebind-hotkey": (accelerator: string) => ipcRenderer.invoke("quick-task:rebind-hotkey", accelerator) as Promise<HotkeyRebindResult>,
  "quick-task:on-shown": (callback: () => void) => {
    const subscription = () => callback()
    ipcRenderer.on("quick-task:shown", subscription)
    return () => ipcRenderer.removeListener("quick-task:shown", subscription)
  },
  "quick-task:set-menu": (menu: QuickTaskMenu | null) => ipcRenderer.send("quick-task:set-menu", menu),
  "quick-task:on-menu-pick": (callback: (index: number) => void) => {
    const subscription = (_event: unknown, index: number) => callback(index)
    ipcRenderer.on("quick-task:menu-pick", subscription)
    return () => ipcRenderer.removeListener("quick-task:menu-pick", subscription)
  },
  "quick-task-menu:on-menu": (callback: (menu: QuickTaskMenu | null) => void) => {
    const subscription = (_event: unknown, menu: QuickTaskMenu | null) => callback(menu)
    ipcRenderer.on("quick-task-menu:menu", subscription)
    return () => ipcRenderer.removeListener("quick-task-menu:menu", subscription)
  },
  "quick-task-menu:resize": (height: number) => ipcRenderer.send("quick-task-menu:resize", height),
  "quick-task-menu:pick": (index: number) => ipcRenderer.send("quick-task-menu:pick", index),

  "task-timers:get": () => ipcRenderer.invoke("task-timers:get") as Promise<TaskTimer[]>,
  "task-timers:dispatch": (command: TaskTimerCommand) => ipcRenderer.invoke("task-timers:dispatch", command) as Promise<boolean>,
  "task-timers:on-changed": (callback: (timers: TaskTimer[]) => void) => {
    const subscription = (_event: unknown, timers: TaskTimer[]) => callback(timers)
    ipcRenderer.on("task-timers:changed", subscription)
    return () => ipcRenderer.removeListener("task-timers:changed", subscription)
  },

  "tasks:get-all": () => ipcRenderer.invoke("tasks:get-all") as Promise<Task[]>,
  "tasks:get-one": (id: Task["id"]) => ipcRenderer.invoke("tasks:get-one", id) as Promise<Task | null>,
  "tasks:update": (id: Task["id"], updates: PartialDeep<Task>, spentTimeDelta?: number) =>
    ipcRenderer.invoke("tasks:update", id, updates, spentTimeDelta) as Promise<Changeset>,
  "tasks:create": (
    task: Omit<Task, "id" | "createdAt" | "updatedAt" | "deletedAt" | "branchId"> & {branchId?: Task["branchId"]; id?: Task["id"]},
  ) => ipcRenderer.invoke("tasks:create", task) as Promise<Changeset>,
  "tasks:move-by-order": (params) => ipcRenderer.invoke("tasks:move-by-order", params) as Promise<Changeset>,
  "tasks:move-to-branch": (taskId: Task["id"], branchId: Branch["id"]) => ipcRenderer.invoke("tasks:move-to-branch", taskId, branchId) as Promise<Changeset>,
  "tasks:delete": (id: Task["id"]) => ipcRenderer.invoke("tasks:delete", id) as Promise<Changeset>,
  "tasks:get-deleted": (params?: {limit?: number; branchId?: Branch["id"]}) => ipcRenderer.invoke("tasks:get-deleted", params) as Promise<Task[]>,
  "tasks:restore": (id: Task["id"]) => ipcRenderer.invoke("tasks:restore", id) as Promise<Changeset>,
  "tasks:delete-permanently": (id: Task["id"]) => ipcRenderer.invoke("tasks:delete-permanently", id) as Promise<boolean>,
  "tasks:delete-all-permanently": () => ipcRenderer.invoke("tasks:delete-all-permanently") as Promise<number>,

  "relations:get-all": () => ipcRenderer.invoke("relations:get-all") as Promise<TaskRelation[]>,
  "relations:set": (taskId: Task["id"], next: TaskRelationSets) => ipcRenderer.invoke("relations:set", taskId, next) as Promise<Changeset>,

  "comments:get-by-task": (taskId: Task["id"]) => ipcRenderer.invoke("comments:get-by-task", taskId) as Promise<TaskComment[]>,
  "comments:get-counts": () => ipcRenderer.invoke("comments:get-counts") as Promise<TaskCommentCounts>,
  "comments:create": (taskId: Task["id"], content: string) => ipcRenderer.invoke("comments:create", taskId, content) as Promise<Changeset>,
  "comments:update": (id: TaskComment["id"], content: string) => ipcRenderer.invoke("comments:update", id, content) as Promise<Changeset>,
  "comments:delete": (id: TaskComment["id"]) => ipcRenderer.invoke("comments:delete", id) as Promise<Changeset>,
  "subtasks:get-by-task": (taskId: Task["id"]) => ipcRenderer.invoke("subtasks:get-by-task", taskId) as Promise<Subtask[]>,
  "subtasks:get-counts": () => ipcRenderer.invoke("subtasks:get-counts") as Promise<SubtaskCounts>,
  "subtasks:create": (taskId: Task["id"], content: string) => ipcRenderer.invoke("subtasks:create", taskId, content) as Promise<Changeset>,
  "subtasks:update": (id: Subtask["id"], updates: {content?: string; done?: boolean}) =>
    ipcRenderer.invoke("subtasks:update", id, updates) as Promise<Changeset>,
  "subtasks:delete": (id: Subtask["id"]) => ipcRenderer.invoke("subtasks:delete", id) as Promise<Changeset>,
  "subtasks:make-task": (id: Subtask["id"]) => ipcRenderer.invoke("subtasks:make-task", id) as Promise<Task | null>,

  "branches:get-many": () => ipcRenderer.invoke("branches:get-many") as Promise<Branch[]>,
  "branches:create": (branch: Omit<Branch, "id" | "createdAt" | "updatedAt" | "deletedAt">) => ipcRenderer.invoke("branches:create", branch),
  "branches:update": (id: Branch["id"], updates: Partial<Pick<Branch, "name" | "description">>) => ipcRenderer.invoke("branches:update", id, updates),
  "branches:delete": (id: Branch["id"]) => ipcRenderer.invoke("branches:delete", id),
  "branches:set-active": (id: Branch["id"]) => ipcRenderer.invoke("branches:set-active", id),

  "search:query": (query: string) => ipcRenderer.invoke("search:query", query) as Promise<TaskSearchResult[]>,

  "tags:get-many": () => ipcRenderer.invoke("tags:get-many") as Promise<Tag[]>,
  "tags:create": (tag: Omit<Tag, "id" | "createdAt" | "updatedAt" | "deletedAt">) => ipcRenderer.invoke("tags:create", tag),
  "tags:delete": (id: Tag["id"]) => ipcRenderer.invoke("tags:delete", id),

  "milestones:get-many": (branchId?: Branch["id"]) => ipcRenderer.invoke("milestones:get-many", branchId) as Promise<Milestone[]>,
  "milestones:create": (milestone: Omit<Milestone, "id" | "createdAt" | "updatedAt" | "orderIndex">) =>
    ipcRenderer.invoke("milestones:create", milestone) as Promise<Changeset>,
  "milestones:update": (id: Milestone["id"], updates: Partial<Pick<Milestone, "name" | "description" | "targetDate" | "orderIndex">>) =>
    ipcRenderer.invoke("milestones:update", id, updates) as Promise<Changeset>,
  "milestones:delete": (id: Milestone["id"]) => ipcRenderer.invoke("milestones:delete", id) as Promise<Changeset>,

  "files:save": (filename: string, data: Buffer) => ipcRenderer.invoke("files:save", filename, data),
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
  "shortcut:ui:calendar-dock:toggle": (callback: () => void) => ipcRenderer.on(SHORTCUTS_MAP["ui:calendar-dock:toggle"].channel, () => callback()),
} satisfies BridgeIPC)
