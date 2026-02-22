import type {ISODate} from "@shared/types/common"
import type {TaskSearchResult} from "@shared/types/search"
import type {Branch, Day, File, MoveTaskByOrderParams, Settings, SyncStatus, Tag, Task} from "@shared/types/storage"
import type {ReplaceValue} from "@shared/types/utils"
import type {PartialDeep} from "type-fest"

export type TaskInternal = ReplaceValue<Task, "tags", Tag["id"][]>

export interface IStorageController {
  rootDir: string
  init(): Promise<void>

  getDays(params?: {from?: ISODate; to?: ISODate; branchId?: Branch["id"]}): Promise<Day[]>
  getDay(date: ISODate): Promise<Day | null>

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

  setupStorageBroadcasts(callbacks: {onStatusChange: (status: SyncStatus, prevStatus: SyncStatus) => void; onDataChange: () => void}): void

  activateSync(): Promise<void>
  deactivateSync(): Promise<void>
  forceSync(): Promise<void>
  getSyncStatus(): SyncStatus
}
