import type {
  Branch,
  Day,
  DeviceRole,
  EnrollmentPollView,
  EnrollmentTicketView,
  EnrollmentWindowView,
  File,
  ISODate,
  MigrationDirection,
  MigrationPreview,
  MoveTaskByOrderParams,
  PendingApprovalView,
  ServerBindingView,
  ServerConnectionStateView,
  ServerMembershipView,
  ServerProbeView,
  Settings,
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
import type {ReplaceValue} from "@daily/std"
import type {PartialDeep} from "type-fest"

export type TaskInternal = ReplaceValue<Task, "tags", Tag["id"][]>

/**
 * The Daily Sync Server provider, as the controller exposes it: probing an address, binding this
 * device, peer approval and disconnecting. Declared here rather than imported so that the
 * controller surface never names the protocol client, and no method of it carries a credential.
 */
export interface IServerProvider {
  defaultDeviceName(): string
  getState(): Promise<ServerConnectionStateView>
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
}

export interface IStorageController {
  rootDir: string
  init(): Promise<void>

  getDays(params?: {from?: ISODate; to?: ISODate; branchId?: Branch["id"]}): Promise<Day[]>
  getDay(date: ISODate): Promise<Day | null>

  getActivityByDay(date: ISODate, branchId?: Branch["id"]): Promise<TaskEvent[]>
  getTaskHistory(taskId: Task["id"]): Promise<TaskEvent[]>
  getStats(period: StatsPeriod, anchor: ISODate, branchId?: Branch["id"]): Promise<StatsAggregate>

  getTaskList(params?: {from?: ISODate; to?: ISODate; limit?: number; branchId?: Branch["id"]}): Promise<Task[]>
  getTask(id: Task["id"]): Promise<Task | null>
  updateTask(id: Task["id"], updates: PartialDeep<Task>): Promise<Task | null>
  toggleTaskMinimized(id: Task["id"], minimized: boolean): Promise<Task | null>
  moveTaskByOrder(params: MoveTaskByOrderParams): Promise<Task | null>
  moveTaskToBranch(taskId: Task["id"], branchId: Branch["id"]): Promise<boolean>
  createTask(task: Omit<Task, "id" | "createdAt" | "updatedAt">): Promise<Task | null>
  deleteTask(id: Task["id"]): Promise<boolean>
  getDeletedTasks(params?: {limit?: number; branchId?: Branch["id"]}): Promise<Task[]>
  restoreTask(id: Task["id"]): Promise<Task | null>
  permanentlyDeleteTask(id: Task["id"]): Promise<boolean>
  permanentlyDeleteAllDeletedTasks(): Promise<number>

  searchTasks(query: string): Promise<TaskSearchResult[]>

  getTagList(): Promise<Tag[]>
  getTag(id: Tag["id"]): Promise<Tag | null>
  updateTag(id: Tag["id"], updates: Partial<Tag>): Promise<Tag | null>
  createTag(tag: Omit<Tag, "id" | "createdAt" | "updatedAt">): Promise<Tag | null>
  deleteTag(id: Tag["id"]): Promise<boolean>

  addTaskTags(taskId: Task["id"], tagIds: Tag["id"][]): Promise<Task | null>
  removeTaskTags(taskId: Task["id"], tagIds: Tag["id"][]): Promise<Task | null>

  getBranchList(): Promise<Branch[]>
  getBranch(id: Branch["id"]): Promise<Branch | null>
  createBranch(branch: Omit<Branch, "id" | "createdAt" | "updatedAt" | "deletedAt">): Promise<Branch | null>
  updateBranch(id: Branch["id"], updates: Pick<Branch, "name">): Promise<Branch | null>
  deleteBranch(id: Branch["id"]): Promise<boolean>
  setActiveBranch(id: Branch["id"]): Promise<void>

  addTaskAttachment(taskId: Task["id"], fileId: File["id"]): Promise<Task | null>
  removeTaskAttachment(taskId: Task["id"], fileId: File["id"]): Promise<Task | null>

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
    onDataChange: () => void
    onSettingsChange: () => void
    onRevoked?: () => void
    onRoleChanged?: (role: DeviceRole) => void
  }): void
}
