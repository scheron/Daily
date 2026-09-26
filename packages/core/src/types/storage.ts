import type {
  AgentWindowView,
  Branch,
  DeviceRole,
  EnrollmentPollView,
  EnrollmentTicketView,
  EnrollmentWindowView,
  File,
  ISODate,
  MigrationDirection,
  MigrationPreview,
  Milestone,
  MoveTaskByOrderParams,
  PendingAgentRequestView,
  PendingApprovalView,
  ServerAgentsView,
  ServerBindingView,
  ServerConnectionStateView,
  ServerMembershipView,
  ServerProbeView,
  Settings,
  SyncProvider,
  SyncRemoteState,
  SyncStatus,
  Tag,
  Task,
  TaskComment,
  TaskCommentCounts,
  TaskCommentSource,
  TaskEvent,
  TaskRelation,
  TaskRelationSets,
  TaskSearchResult,
} from "@daily/protocol"
import type {ReplaceValue} from "@daily/std"
import type {PartialDeep} from "type-fest"

export type TaskInternal = ReplaceValue<Task, "tags", Tag["id"][]>

/** The source a storage core dates its work by. Absent, the core reads the process's local date. */
export type StorageClock = {today(): ISODate}

/** What one write, or one sync pull, changed. A removal means `deletedAt` was set. Absent keys mean that collection was untouched. */
export type Changeset = {
  tasks?: {upserted?: Task[]; removed?: Task["id"][]}
  milestones?: {upserted?: Milestone[]; removed?: Milestone["id"][]}
  tags?: {upserted?: Tag[]; removed?: Tag["id"][]}
  branches?: {upserted?: Branch[]; removed?: Branch["id"][]}
  relations?: {upserted?: TaskRelation[]; removed?: TaskRelation["id"][]}
  comments?: {upserted?: TaskComment[]; removed?: TaskComment["id"][]}
}

/** Nothing changed. A no-op move returns this rather than throwing. */
export const EMPTY_CHANGESET: Changeset = {}

/**
 * The Daily Sync Server provider, as the controller exposes it: probing an address, binding this
 * device, peer approval and disconnecting. Declared here rather than imported so that the
 * controller surface never names the protocol client, and no method of it carries a credential.
 */
export interface IServerProvider {
  defaultDeviceName(): string
  getState(): Promise<ServerConnectionStateView>
  retry(): Promise<void>
  probe(baseUrl: string): Promise<ServerProbeView>
  claim(code: string, deviceName: string, confirmInsecure: boolean): Promise<ServerBindingView>
  requestEnrollment(deviceName: string, confirmInsecure: boolean): Promise<EnrollmentTicketView>
  pollEnrollment(): Promise<EnrollmentPollView>
  cancelConnection(): void
  disconnect(): Promise<void>

  pendingApproval(): Promise<PendingApprovalView | null>
  approve(requestId: string, code: string): Promise<void>
  deny(requestId: string): Promise<void>

  listMembership(): Promise<ServerMembershipView>
  revokeDevice(deviceId: string): Promise<ServerMembershipView>
  openEnrollmentWindow(): Promise<EnrollmentWindowView>
  closeEnrollmentWindow(): Promise<void>

  openAgentWindow(): Promise<AgentWindowView>
  closeAgentWindow(): Promise<void>
  pendingAgentRequest(): Promise<PendingAgentRequestView | null>
  approveAgent(requestId: string, code: string): Promise<void>
  denyAgent(requestId: string): Promise<void>
  listAgents(): Promise<ServerAgentsView>
  revokeAgent(agentId: string): Promise<ServerAgentsView>
}

export interface IStorageController {
  rootDir: string
  init(): Promise<void>

  getTaskHistory(taskId: Task["id"]): Promise<TaskEvent[]>

  /** Every live task of every project, backlog included. */
  getAllTasks(): Promise<Task[]>
  getTaskList(params?: {from?: ISODate; to?: ISODate; limit?: number; branchId?: Branch["id"]}): Promise<Task[]>
  getTask(id: Task["id"]): Promise<Task | null>
  updateTask(id: Task["id"], updates: PartialDeep<Task>): Promise<Changeset>
  toggleTaskMinimized(id: Task["id"], minimized: boolean): Promise<Changeset>
  moveTaskByOrder(params: MoveTaskByOrderParams): Promise<Changeset>
  moveTaskToBranch(taskId: Task["id"], branchId: Branch["id"]): Promise<Changeset>
  createTask(task: Omit<Task, "id" | "createdAt" | "updatedAt">): Promise<Changeset>
  deleteTask(id: Task["id"]): Promise<Changeset>
  getDeletedTasks(params?: {limit?: number; branchId?: Branch["id"]}): Promise<Task[]>
  restoreTask(id: Task["id"]): Promise<Changeset>
  permanentlyDeleteTask(id: Task["id"]): Promise<boolean>
  permanentlyDeleteAllDeletedTasks(): Promise<number>

  /** Every live relation of every project. */
  getAllTaskRelations(): Promise<TaskRelation[]>
  /** The live tasks this task waits on and the live tasks waiting on it, within its project, resolved ones included, oldest link first. */
  getTaskRelations(taskId: Task["id"]): Promise<{blockedBy: Task[]; blocks: Task[]}>
  /** Makes the task's links exactly `next`, dropping what cannot be linked; `EMPTY_CHANGESET` when nothing changed. */
  setTaskRelations(taskId: Task["id"], next: TaskRelationSets): Promise<Changeset>

  /** One task's live comments, oldest first. */
  getTaskComments(taskId: Task["id"]): Promise<TaskComment[]>
  /** How many live comments each task carries; a task with none is absent. */
  getTaskCommentCounts(): Promise<TaskCommentCounts>

  /** Writes a comment on a live task. `source` defaults to a comment typed in the app. */
  createTaskComment(taskId: Task["id"], content: string, source?: TaskCommentSource): Promise<Changeset>
  updateTaskComment(id: TaskComment["id"], content: string): Promise<Changeset>
  deleteTaskComment(id: TaskComment["id"]): Promise<Changeset>

  searchTasks(query: string): Promise<TaskSearchResult[]>

  getTagList(branchId?: Branch["id"]): Promise<Tag[]>
  getTag(id: Tag["id"]): Promise<Tag | null>
  updateTag(id: Tag["id"], updates: Partial<Tag>): Promise<Tag | null>
  createTag(tag: Omit<Tag, "id" | "createdAt" | "updatedAt">): Promise<Tag | null>
  deleteTag(id: Tag["id"]): Promise<boolean>

  addTaskTags(taskId: Task["id"], tagIds: Tag["id"][]): Promise<Changeset>
  removeTaskTags(taskId: Task["id"], tagIds: Tag["id"][]): Promise<Changeset>

  getMilestoneList(branchId?: Branch["id"]): Promise<Milestone[]>
  getMilestone(id: Milestone["id"]): Promise<Milestone | null>
  createMilestone(milestone: Omit<Milestone, "id" | "createdAt" | "updatedAt" | "orderIndex">): Promise<Changeset>
  updateMilestone(id: Milestone["id"], updates: Partial<Pick<Milestone, "name" | "description" | "targetDate" | "orderIndex">>): Promise<Changeset>
  deleteMilestone(id: Milestone["id"]): Promise<Changeset>

  getBranchList(): Promise<Branch[]>
  getBranch(id: Branch["id"]): Promise<Branch | null>
  createBranch(branch: Pick<Branch, "name"> & Partial<Pick<Branch, "description">>): Promise<Branch | null>
  updateBranch(id: Branch["id"], updates: Partial<Pick<Branch, "description" | "name">>): Promise<Branch | null>
  deleteBranch(id: Branch["id"]): Promise<boolean>
  setActiveBranch(id: Branch["id"]): Promise<void>

  loadSettings(): Promise<Settings>
  saveSettings(newSettings: Partial<Settings>): Promise<void>

  saveFile(filename: string, data: Buffer): Promise<File["id"]>
  getFilePath(id: File["id"]): string
  deleteFile(fileId: File["id"]): Promise<boolean>
  getFiles(fileIds: File["id"][]): Promise<File[]>
  createFileResponse(id: File["id"]): Promise<Response>
  cleanupOrphanFiles(): Promise<void>

  forceSync(): Promise<void>
  getSyncStatus(): SyncStatus
  getSyncRemoteStates(): SyncRemoteState[]
  getServerProvider(): IServerProvider
  previewMigration(target: Exclude<SyncProvider, "off">): Promise<MigrationPreview>
  migrateProvider(target: SyncProvider, direction: MigrationDirection | null): Promise<void>

  setupStorageBroadcasts(callbacks: {
    onStatusChange: (status: SyncStatus, prevStatus: SyncStatus) => void
    onDataChange: (changeset: Changeset) => void
    onSettingsChange: () => void
    onRevoked?: () => void
    onRoleChanged?: (role: DeviceRole) => void
    onAgentRequested?: () => void
    onAgentsAcceptedChanged?: (acceptsAgents: boolean) => void
    onReachabilityChanged?: (isReachable: boolean) => void
  }): void
}
